export interface DeviceAuthEnv {
  DB: D1Database;
}

export type DeviceUser = {
  id: string;
  displayName: string;
};

export const DEVICE_COOKIE = "study_base_device";
export const SESSION_COOKIE = "study_base_session";

const encoder = new TextEncoder();

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function hashToken(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function hashPin(pin: string, saltBase64: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: base64ToBytes(saltBase64),
    iterations: 25_000,
  }, key, 256);
  return bytesToHex(bits);
}

export function createSalt() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export function createToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

export function parseCookies(request: Request) {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) cookies.set(key, decodeURIComponent(value));
  }
  return cookies;
}

export function authCookie(name: string, value: string, request: Request, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export async function ensureDeviceAuthTables(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS device_users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      device_token_hash TEXT NOT NULL UNIQUE,
      pin_salt TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS device_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS device_sessions_user_idx ON device_sessions(user_id)"),
  ]);
}

export async function getAuthenticatedDeviceUser(request: Request, db: D1Database): Promise<DeviceUser | null> {
  await ensureDeviceAuthTables(db);
  const sessionToken = parseCookies(request).get(SESSION_COOKIE);
  if (!sessionToken) return null;
  const sessionHash = await hashToken(sessionToken);
  const row = await db.prepare(`SELECT u.id, u.display_name
    FROM device_sessions s
    JOIN device_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP`)
    .bind(sessionHash).first<{ id: string; display_name: string }>();
  return row ? { id: row.id, displayName: row.display_name } : null;
}
