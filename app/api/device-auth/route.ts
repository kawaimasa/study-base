import { env } from "cloudflare:workers";
import {
  authCookie,
  createSalt,
  createToken,
  DEVICE_COOKIE,
  ensureDeviceAuthTables,
  getAuthenticatedDeviceUser,
  hashPin,
  hashToken,
  parseCookies,
  SESSION_COOKIE,
  type DeviceAuthEnv,
} from "../../../lib/device-auth";
import { recordStudentLogin } from "../../../lib/study-records";

const SESSION_SECONDS = 30 * 24 * 60 * 60;
const DEVICE_SECONDS = 365 * 24 * 60 * 60;

function toGivenNameOnly(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.split(" ").at(-1)!.slice(0, 20);
}

function jsonWithCookies(data: unknown, request: Request, cookies: Array<[string, string, number]>, status = 200) {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const [name, value, maxAge] of cookies) headers.append("Set-Cookie", authCookie(name, value, request, maxAge));
  return new Response(JSON.stringify(data), { status, headers });
}

async function startSession(db: D1Database, userId: string) {
  const token = createToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await db.prepare("INSERT INTO device_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(tokenHash, userId, expiresAt).run();
  return token;
}

export async function GET(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  await ensureDeviceAuthTables(runtime.DB);
  const user = await getAuthenticatedDeviceUser(request, runtime.DB);
  if (user) {
    await recordStudentLogin(runtime.DB, user.id);
    return Response.json({ authenticated: true, user });
  }

  const deviceToken = parseCookies(request).get(DEVICE_COOKIE);
  if (!deviceToken) return Response.json({ authenticated: false, requiresSetup: true });
  const deviceHash = await hashToken(deviceToken);
  const profile = await runtime.DB.prepare("SELECT display_name, is_active FROM device_users WHERE device_token_hash = ?")
    .bind(deviceHash).first<{ display_name: string; is_active: number }>();
  return Response.json({
    authenticated: false,
    requiresSetup: !profile,
    displayName: profile?.display_name ?? null,
    disabled: profile ? !Boolean(profile.is_active) : false,
  });
}

export async function POST(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  await ensureDeviceAuthTables(runtime.DB);
  let payload: { action?: "register" | "login" | "logout"; displayName?: string; pin?: string };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return Response.json({ error: "JSON形式が正しくありません。" }, { status: 400 });
  }

  if (payload.action === "logout") {
    const sessionToken = parseCookies(request).get(SESSION_COOKIE);
    if (sessionToken) {
      await runtime.DB.prepare("DELETE FROM device_sessions WHERE token_hash = ?").bind(await hashToken(sessionToken)).run();
    }
    return jsonWithCookies({ authenticated: false }, request, [[SESSION_COOKIE, "", 0]]);
  }

  const pin = payload.pin?.trim() ?? "";
  if (!/^\d{4,8}$/.test(pin)) return Response.json({ error: "PINは4〜8桁の数字で入力してください。" }, { status: 400 });
  const cookies = parseCookies(request);

  if (payload.action === "register") {
    const displayName = toGivenNameOnly(payload.displayName ?? "");
    if (displayName.length < 1 || displayName.length > 20) {
      return Response.json({ error: "名前は1〜20文字で入力してください。" }, { status: 400 });
    }
    const deviceToken = cookies.get(DEVICE_COOKIE) ?? createToken();
    const deviceHash = await hashToken(deviceToken);
    const existing = await runtime.DB.prepare("SELECT id FROM device_users WHERE device_token_hash = ?").bind(deviceHash).first();
    const capacity = await runtime.DB.prepare("SELECT COUNT(*) AS count FROM device_users WHERE is_active = 1")
      .first<{ count: number }>();
    if (!existing && Number(capacity?.count ?? 0) >= 6) {
      return Response.json({ error: "利用できる生徒は6人までです。管理者に確認してください。" }, { status: 409 });
    }
    if (existing) return Response.json({ error: "この端末にはすでに利用者が登録されています。" }, { status: 409 });

    const userId = `student-${crypto.randomUUID()}`;
    const pinSalt = createSalt();
    const pinHash = await hashPin(pin, pinSalt);
    const inserted = await runtime.DB.prepare(`INSERT INTO device_users
      (id, display_name, device_token_hash, pin_salt, pin_hash)
      SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM device_users WHERE is_active = 1) < 6`)
      .bind(userId, displayName, deviceHash, pinSalt, pinHash).run();
    if (!inserted.meta.changes) {
      return Response.json({ error: "利用できる生徒は6人までです。管理者に確認してください。" }, { status: 409 });
    }
    await recordStudentLogin(runtime.DB, userId);
    const sessionToken = await startSession(runtime.DB, userId);
    return jsonWithCookies({ authenticated: true, user: { id: userId, displayName } }, request, [
      [DEVICE_COOKIE, deviceToken, DEVICE_SECONDS],
      [SESSION_COOKIE, sessionToken, SESSION_SECONDS],
    ]);
  }

  if (payload.action === "login") {
    const deviceToken = cookies.get(DEVICE_COOKIE);
    if (!deviceToken) return Response.json({ error: "この端末は未登録です。初回登録から始めてください。" }, { status: 404 });
    const deviceHash = await hashToken(deviceToken);
    const profile = await runtime.DB.prepare(`SELECT id, display_name, pin_salt, pin_hash, failed_attempts, locked_until, is_active
      FROM device_users WHERE device_token_hash = ?`)
      .bind(deviceHash).first<Record<string, string | number | null>>();
    if (!profile) return Response.json({ error: "この端末の登録情報が見つかりません。" }, { status: 404 });
    if (!Boolean(profile.is_active)) return Response.json({ error: "この生徒は停止中です。管理者に利用再開を依頼してください。" }, { status: 403 });

    if (profile.locked_until && new Date(String(profile.locked_until)).getTime() > Date.now()) {
      return Response.json({ error: "PINを続けて間違えたため、5分後にもう一度試してください。" }, { status: 429 });
    }
    const matches = await hashPin(pin, String(profile.pin_salt)) === String(profile.pin_hash);
    if (!matches) {
      const attempts = Number(profile.failed_attempts ?? 0) + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;
      await runtime.DB.prepare("UPDATE device_users SET failed_attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(attempts >= 5 ? 0 : attempts, lockedUntil, profile.id).run();
      return Response.json({ error: lockedUntil ? "PINを続けて間違えたため、5分間ロックします。" : "PINが違います。" }, { status: 401 });
    }

    await runtime.DB.prepare("UPDATE device_users SET failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(profile.id).run();
    await recordStudentLogin(runtime.DB, String(profile.id));
    const sessionToken = await startSession(runtime.DB, String(profile.id));
    return jsonWithCookies({ authenticated: true, user: { id: profile.id, displayName: profile.display_name } }, request, [
      [SESSION_COOKIE, sessionToken, SESSION_SECONDS],
    ]);
  }

  return Response.json({ error: "操作を選択してください。" }, { status: 400 });
}
