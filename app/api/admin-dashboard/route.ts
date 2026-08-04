import { env } from "cloudflare:workers";
import { getAuthenticatedAdmin } from "../../../lib/admin-auth";
import { ensureDeviceAuthTables, type DeviceAuthEnv } from "../../../lib/device-auth";
import { ensureGuardianReportTables, jstDateKey } from "../../../lib/guardian-reports";
import { ensureStudyPresenceTable } from "../../../lib/study-presence";
import { ensureStudyRecordTables } from "../../../lib/study-records";

function makePairingCode() {
  return `SB-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

type AdminDashboardEnv = DeviceAuthEnv & {
  LINE_CHANNEL_SECRET?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
};

export async function GET(request: Request) {
  const runtime = env as unknown as AdminDashboardEnv;
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
    ), away_stats AS (
      SELECT student_id,
        COALESCE(away_seconds, 0) + COALESCE(idle_seconds, 0) + COALESCE(juku_away_seconds, 0) AS away_seconds,
        COALESCE(away_count, 0) + COALESCE(idle_count, 0) + COALESCE(juku_away_count, 0) AS away_count
      FROM daily_away_stats WHERE summary_date = ?
    )
    SELECT
      u.id,
      u.display_name,
      u.created_at,
      u.is_active,
      MAX(COALESCE(sf.focus_seconds, 0), COALESCE(s.focus_seconds, 0)) AS focus_seconds,
      MAX(COALESCE(a.questions_solved, 0), COALESCE(s.questions_solved, 0)) AS questions_solved,
      MAX(COALESCE(a.correct_answers, 0), COALESCE(s.correct_answers, 0)) AS correct_answers,
      COALESCE(aw.away_seconds, 0) AS away_seconds,
      COALESCE(aw.away_count, 0) AS away_count,
      CASE WHEN g.parent_line_user_id IS NOT NULL THEN 1 ELSE 0 END AS guardian_connected,
      CASE WHEN g.parent_line_user_id IS NULL AND g.pairing_used_at IS NULL AND datetime(g.pairing_expires_at) > CURRENT_TIMESTAMP THEN g.pairing_code ELSE NULL END AS pairing_code,
      COALESCE(g.notifications_enabled, 0) AS notifications_enabled
    FROM device_users u
    LEFT JOIN guardian_profiles g ON g.student_id = u.id
    LEFT JOIN daily_summaries s ON s.student_id = u.id AND s.summary_date = ?
    LEFT JOIN session_focus sf ON sf.student_id = u.id
    LEFT JOIN attempts a ON a.student_id = u.id
    LEFT JOIN away_stats aw ON aw.student_id = u.id
    ORDER BY u.created_at DESC LIMIT 100`).bind(today, today, today, today).all<Record<string, unknown>>();
  const totals = results.filter((row) => Boolean(row.is_active)).reduce((sum, row) => ({
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
    integrations: {
      lineWebhookConfigured: Boolean(runtime.LINE_CHANNEL_SECRET),
      linePushConfigured: Boolean(runtime.LINE_CHANNEL_ACCESS_TOKEN),
    },
  });
}

export async function POST(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const admin = await getAuthenticatedAdmin(request, runtime.DB);
  if (!admin) return Response.json({ error: "admin login required" }, { status: 401 });

  await ensureDeviceAuthTables(runtime.DB);
  await ensureGuardianReportTables(runtime.DB);
  let payload: { action?: "guardian-notification" | "student-status"; studentId?: string; enabled?: boolean; active?: boolean };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return Response.json({ error: "JSON形式が正しくありません。" }, { status: 400 });
  }
  const studentId = payload.studentId?.trim();
  if (payload.action === "student-status") {
    if (!studentId || typeof payload.active !== "boolean") {
      return Response.json({ error: "studentId and active are required" }, { status: 400 });
    }
    if (payload.active) {
      const activeCount = await runtime.DB.prepare("SELECT COUNT(*) AS count FROM device_users WHERE is_active = 1")
        .first<{ count: number }>();
      if (Number(activeCount?.count ?? 0) >= 6) {
        return Response.json({ error: "有効にできる生徒は6人までです。" }, { status: 409 });
      }
    }
    const result = await runtime.DB.prepare("UPDATE device_users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(payload.active ? 1 : 0, studentId).run();
    if (!result.meta.changes) return Response.json({ error: "student not found" }, { status: 404 });
    if (!payload.active) await runtime.DB.prepare("DELETE FROM device_sessions WHERE user_id = ?").bind(studentId).run();
    return Response.json({ saved: true, active: payload.active });
  }
  if (!studentId || typeof payload.enabled !== "boolean") {
    return Response.json({ error: "studentId and enabled are required" }, { status: 400 });
  }

  const student = await runtime.DB.prepare(`SELECT COALESCE(g.student_name, u.display_name) AS display_name
      FROM device_users u
      LEFT JOIN guardian_profiles g ON g.student_id = u.id
    WHERE u.id = ?`)
    .bind(studentId).first<{ display_name: string }>();
  if (!student) return Response.json({ error: "student not found" }, { status: 404 });

  const existing = await runtime.DB.prepare("SELECT parent_line_user_id FROM guardian_profiles WHERE student_id = ?")
    .bind(studentId).first<{ parent_line_user_id: string | null }>();
  const pairingCode = existing?.parent_line_user_id ? null : makePairingCode();
  const pairingExpiresAt = pairingCode ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null;
  await runtime.DB.prepare(`INSERT INTO guardian_profiles
    (student_id, student_name, pairing_code, pairing_expires_at, pairing_used_at, notifications_enabled, parent_consent_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id) DO UPDATE SET
      student_name = excluded.student_name,
      pairing_code = CASE WHEN guardian_profiles.parent_line_user_id IS NULL THEN excluded.pairing_code ELSE guardian_profiles.pairing_code END,
      pairing_expires_at = CASE WHEN guardian_profiles.parent_line_user_id IS NULL THEN excluded.pairing_expires_at ELSE guardian_profiles.pairing_expires_at END,
      pairing_used_at = CASE WHEN guardian_profiles.parent_line_user_id IS NULL THEN NULL ELSE guardian_profiles.pairing_used_at END,
      notifications_enabled = excluded.notifications_enabled,
      parent_consent_at = excluded.parent_consent_at,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(studentId, student.display_name, pairingCode ?? makePairingCode(), pairingExpiresAt, payload.enabled ? 1 : 0, payload.enabled ? new Date().toISOString() : null)
    .run();

  return Response.json({ saved: true, pairingCode, enabled: payload.enabled });
}
