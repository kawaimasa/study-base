import { env } from "cloudflare:workers";
import { createSalt, hashPin, hashToken, parseCookies, type DeviceAuthEnv } from "../../../lib/device-auth";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookie,
  createAdminSession,
  ensureAdminAuthTables,
  getAuthenticatedAdmin,
} from "../../../lib/admin-auth";

export async function GET(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  await ensureAdminAuthTables(runtime.DB);
  const admin = await getAuthenticatedAdmin(request, runtime.DB);
  if (admin) return Response.json({ authenticated: true, admin });
  const row = await runtime.DB.prepare("SELECT COUNT(*) AS count FROM admin_users").first<{ count: number }>();
  return Response.json({ authenticated: false, setupRequired: Number(row?.count ?? 0) === 0 });
}

export async function POST(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  await ensureAdminAuthTables(runtime.DB);
  let payload: { action?: "setup" | "login" | "logout"; loginId?: string; displayName?: string; pin?: string };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return Response.json({ error: "JSON形式が正しくありません。" }, { status: 400 });
  }

  if (payload.action === "logout") {
    const token = parseCookies(request).get(ADMIN_SESSION_COOKIE);
    if (token) await runtime.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await hashToken(token)).run();
    return new Response(JSON.stringify({ authenticated: false }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": adminSessionCookie("", request, 0) },
    });
  }

  const loginId = payload.loginId?.trim().toLowerCase() ?? "";
  const pin = payload.pin?.trim() ?? "";
  if (!/^[a-z0-9._-]{3,30}$/.test(loginId)) return Response.json({ error: "管理者IDは半角英数字3〜30文字で入力してください。" }, { status: 400 });
  if (!/^\d{6,12}$/.test(pin)) return Response.json({ error: "管理者PINは6〜12桁の数字で入力してください。" }, { status: 400 });

  if (payload.action === "setup") {
    const count = await runtime.DB.prepare("SELECT COUNT(*) AS count FROM admin_users").first<{ count: number }>();
    if (Number(count?.count ?? 0) > 0) return Response.json({ error: "管理者はすでに登録されています。" }, { status: 409 });
    const displayName = payload.displayName?.trim() ?? "";
    if (displayName.length < 1 || displayName.length > 20) return Response.json({ error: "管理者名は1〜20文字で入力してください。" }, { status: 400 });
    const adminId = `admin-${crypto.randomUUID()}`;
    const salt = createSalt();
    const inserted = await runtime.DB.prepare(`INSERT INTO admin_users (id, login_id, display_name, pin_salt, pin_hash)
      SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM admin_users)`)
      .bind(adminId, loginId, displayName, salt, await hashPin(pin, salt)).run();
    if (!inserted.meta.changes) return Response.json({ error: "管理者はすでに登録されています。" }, { status: 409 });
    const session = await createAdminSession(runtime.DB, adminId);
    return new Response(JSON.stringify({ authenticated: true, admin: { id: adminId, loginId, displayName } }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": adminSessionCookie(session, request) },
    });
  }

  if (payload.action === "login") {
    const admin = await runtime.DB.prepare(`SELECT id, login_id, display_name, pin_salt, pin_hash, failed_attempts, locked_until
      FROM admin_users WHERE login_id = ?`).bind(loginId).first<Record<string, string | number | null>>();
    if (!admin) return Response.json({ error: "管理者IDまたはPINが違います。" }, { status: 401 });
    if (admin.locked_until && new Date(String(admin.locked_until)).getTime() > Date.now()) {
      return Response.json({ error: "ログインを続けて失敗したため、10分後にもう一度試してください。" }, { status: 429 });
    }
    const matches = await hashPin(pin, String(admin.pin_salt)) === String(admin.pin_hash);
    if (!matches) {
      const attempts = Number(admin.failed_attempts ?? 0) + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;
      await runtime.DB.prepare("UPDATE admin_users SET failed_attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(attempts >= 5 ? 0 : attempts, lockedUntil, admin.id).run();
      return Response.json({ error: lockedUntil ? "10分間ロックします。" : "管理者IDまたはPINが違います。" }, { status: 401 });
    }
    await runtime.DB.prepare("UPDATE admin_users SET failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(admin.id).run();
    const session = await createAdminSession(runtime.DB, String(admin.id));
    return new Response(JSON.stringify({ authenticated: true, admin: { id: admin.id, loginId: admin.login_id, displayName: admin.display_name } }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": adminSessionCookie(session, request) },
    });
  }

  return Response.json({ error: "操作を選択してください。" }, { status: 400 });
}
