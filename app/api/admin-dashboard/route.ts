import { env } from "cloudflare:workers";
import { getAuthenticatedAdmin } from "../../../lib/admin-auth";
import { ensureDeviceAuthTables, type DeviceAuthEnv } from "../../../lib/device-auth";
import { ensureGuardianReportTables, jstDateKey } from "../../../lib/guardian-reports";
import { ensureStudyPresenceTable } from "../../../lib/study-presence";
import { ensureStudyRecordTables } from "../../../lib/study-records";

function makePairingCode() {
  return `SB-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export async function GET(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const admin = await getAuthenticatedAdmin(request, runtime.DB);
  if (!admin) return Response.json({ error: "admin login required" }, { status: 401 });
  await ensureDeviceAuthTables(runtime.DB);
  await ensureGuardianReportTables(runtime.DB);
  await ensureStudyPresenceTable(runtime.DB);
  await ensureStudyRecordTables(runtime.DB);
  const today = jstDateKey();
  const { results = [] } = await runtime.DB.prepare(`WITH session_focus AS (
      SELECT student_id, COALESCE(SUM(active_seconds), 0) AS focus_seconds
      FROM study_session_totals WHERE summary_date = ? AND is_juku = 0 GROUP BY student_id
    ), attempts AS (
      SELECT student_id, COUNT(*) AS questions_solved,
        COALESCE(SUM(CASE WHEN result = 'correct' THEN 1 ELSE 0 END), 0) AS correct_answers
      FROM practice_attempts WHERE date(attempted_at, '+9 hours') = ? GROUP BY student_id
    )
    SELECT
      u.id,
      u.display_name,
      u.created_at,
      MAX(COALESCE(s.focus_seconds, 0), COALESCE(sf.focus_seconds, 0)) AS focus_seconds,
      MAX(COALESCE(s.questions_solved, 0), COALESCE(a.questions_solved, 0)) AS questions_solved,
      MAX(COALESCE(s.correct_answers, 0), COALESCE(a.correct_answers, 0)) AS correct_answers,
      CASE WHEN g.parent_line_user_id IS NOT NULL THEN 1 ELSE 0 END AS guardian_connected,
      g.pairing_code,
      COALESCE(g.notifications_enabled, 0) AS notifications_enabled
    FROM device_users u
    LEFT JOIN guardian_profiles g ON g.student_id = u.id
    LEFT JOIN daily_summaries s ON s.student_id = u.id AND s.summary_date = ?
    LEFT JOIN session_focus sf ON sf.student_id = u.id
    LEFT JOIN attempts a ON a.student_id = u.id
    ORDER BY u.created_at DESC LIMIT 100`).bind(today, today, today).all<Record<string, unknown>>();
  const totals = results.reduce((sum, row) => ({
    student_count: sum.student_count + 1,
    focus_seconds: sum.focus_seconds + Number(row.focus_seconds ?? 0),
    questions_solved: sum.questions_solved + Number(row.questions_solved ?? 0),
    correct_answers: sum.correct_answers + Number(row.correct_answers ?? 0),
  }), { student_count: 0, focus_seconds: 0, questions_solved: 0, correct_answers: 0 });
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
