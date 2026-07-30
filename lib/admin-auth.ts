import { authCookie, createToken, hashToken, parseCookies } from "./device-auth";

export const ADMIN_SESSION_COOKIE = "study_base_admin_session";

export type AdminUser = {
  id: string;
  loginId: string;
  displayName: string;
};

export async function ensureAdminAuthTables(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      login_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions(admin_id)"),
  ]);
}

export async function getAuthenticatedAdmin(request: Request, db: D1Database): Promise<AdminUser | null> {
  await ensureAdminAuthTables(db);
  const token = parseCookies(request).get(ADMIN_SESSION_COOKIE);
  if (!token) return null;
  const row = await db.prepare(`SELECT a.id, a.login_id, a.display_name
    FROM admin_sessions s
    JOIN admin_users a ON a.id = s.admin_id
    WHERE s.token_hash = ? AND datetime(s.expires_at) > CURRENT_TIMESTAMP`)
    .bind(await hashToken(token)).first<{ id: string; login_id: string; display_name: string }>();
  return row ? { id: row.id, loginId: row.login_id, displayName: row.display_name } : null;
}

export async function createAdminSession(db: D1Database, adminId: string) {
  const token = createToken();
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  await db.prepare("INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)")
    .bind(await hashToken(token), adminId, expiresAt).run();
  return token;
}

export function adminSessionCookie(value: string, request: Request, maxAge = 8 * 60 * 60) {
  return authCookie(ADMIN_SESSION_COOKIE, value, request, maxAge);
}
