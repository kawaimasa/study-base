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
      (SELECT COUNT(*) FROM guardian_profiles) AS student_count,
      COALESCE(SUM(focus_seconds), 0) AS focus_seconds,
      COALESCE(SUM(questions_solved), 0) AS questions_solved,
      COALESCE(SUM(correct_answers), 0) AS correct_answers
    FROM daily_summaries WHERE summary_date = ?`).bind(today).first<Record<string, number>>();
  const { results = [] } = await runtime.DB.prepare(`WITH roster AS (
      SELECT
        g.student_id AS id,
        g.student_name AS display_name,
        g.created_at AS created_at,
        g.parent_line_user_id AS parent_line_user_id,
        g.pairing_code AS pairing_code,
        g.notifications_enabled AS notifications_enabled
      FROM guardian_profiles g
      UNION ALL
      SELECT
        u.id AS id,
        u.display_name AS display_name,
        u.created_at AS created_at,
        NULL AS parent_line_user_id,
        NULL AS pairing_code,
        0 AS notifications_enabled
      FROM device_users u
      WHERE NOT EXISTS (
        SELECT 1 FROM guardian_profiles g WHERE g.student_id = u.id
      )
    )
    SELECT
      roster.id,
      roster.display_name,
      roster.created_at,
      COALESCE(s.focus_seconds, 0) AS focus_seconds,
      COALESCE(s.questions_solved, 0) AS questions_solved,
      COALESCE(s.correct_answers, 0) AS correct_answers,
      CASE WHEN roster.parent_line_user_id IS NOT NULL THEN 1 ELSE 0 END AS guardian_connected,
      roster.pairing_code,
      COALESCE(roster.notifications_enabled, 0) AS notifications_enabled
    FROM roster
    LEFT JOIN daily_summaries s ON s.student_id = roster.id AND s.summary_date = ?
    ORDER BY roster.created_at DESC LIMIT 100`).bind(today).all<Record<string, unknown>>();
  return Response.json({
    today,
    admin,
    totals,
    students: results,
  });
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

  const student = await runtime.DB.prepare(`SELECT COALESCE(g.student_name, u.display_name) AS display_name
      FROM device_users u
      LEFT JOIN guardian_profiles g ON g.student_id = u.id
      WHERE u.id = ?`)
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
