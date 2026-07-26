import { env } from "cloudflare:workers";
import { getAuthenticatedAdmin } from "../../../lib/admin-auth";
import { ensureDeviceAuthTables, type DeviceAuthEnv } from "../../../lib/device-auth";
import { ensureGuardianReportTables, jstDateKey } from "../../../lib/guardian-reports";

function makePairingCode() {
  return `SB-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export async function GET(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const admin = await getAuthenticatedAdmin(request, runtime.DB);
  if (!admin) return Response.json({ error: "admin login required" }, { status: 401 });
  await ensureDeviceAuthTables(runtime.DB);
  await ensureGuardianReportTables(runtime.DB);
  const today = jstDateKey();
  const totals = await runtime.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM device_users) AS student_count,
      COALESCE(SUM(focus_seconds), 0) AS focus_seconds,
      COALESCE(SUM(questions_solved), 0) AS questions_solved,
      COALESCE(SUM(correct_answers), 0) AS correct_answers
    FROM daily_summaries WHERE summary_date = ?`).bind(today).first<Record<string, number>>();
  const { results = [] } = await runtime.DB.prepare(`SELECT
      u.id, u.display_name, u.created_at,
      COALESCE(s.focus_seconds, 0) AS focus_seconds,
      COALESCE(s.questions_solved, 0) AS questions_solved,
      COALESCE(s.correct_answers, 0) AS correct_answers,
      CASE WHEN g.parent_line_user_id IS NOT NULL THEN 1 ELSE 0 END AS guardian_connected,
      g.pairing_code,
      COALESCE(g.notifications_enabled, 0) AS notifications_enabled
    FROM device_users u
    LEFT JOIN daily_summaries s ON s.student_id = u.id AND s.summary_date = ?
    LEFT JOIN guardian_profiles g ON g.student_id = u.id
    ORDER BY u.created_at DESC LIMIT 100`).bind(today).all<Record<string, unknown>>();
  return Response.json({ today, admin, totals, students: results });
}

export async function POST(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const admin = await getAuthenticatedAdmin(request, runtime.DB);
  if (!admin) return Response.json({ error: "admin login required" }, { status: 401 });

  await ensureDeviceAuthTables(runtime.DB);
  await ensureGuardianReportTables(runtime.DB);
  const payload = await request.json() as { studentId?: string; enabled?: boolean };
  const studentId = payload.studentId?.trim();
  if (!studentId || typeof payload.enabled !== "boolean") {
    return Response.json({ error: "studentId and enabled are required" }, { status: 400 });
  }

  const student = await runtime.DB.prepare("SELECT display_name FROM device_users WHERE id = ?")
    .bind(studentId).first<{ display_name: string }>();
  if (!student) return Response.json({ error: "student not found" }, { status: 404 });

  const existing = await runtime.DB.prepare("SELECT pairing_code FROM guardian_profiles WHERE student_id = ?")
    .bind(studentId).first<{ pairing_code: string }>();
  const pairingCode = existing?.pairing_code ?? makePairingCode();
  await runtime.DB.prepare(`INSERT INTO guardian_profiles
    (student_id, student_name, pairing_code, notifications_enabled, parent_consent_at, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id) DO UPDATE SET
      student_name = excluded.student_name,
      notifications_enabled = excluded.notifications_enabled,
      parent_consent_at = excluded.parent_consent_at,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(studentId, student.display_name, pairingCode, payload.enabled ? 1 : 0, payload.enabled ? new Date().toISOString() : null)
    .run();

  return Response.json({ saved: true, pairingCode, enabled: payload.enabled });
}
