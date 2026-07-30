import { env } from "cloudflare:workers";
import { ensureDeviceAuthTables, getAuthenticatedDeviceUser, type DeviceAuthEnv } from "../../../lib/device-auth";
import { ensureGuardianReportTables, jstDateKey } from "../../../lib/guardian-reports";
import { ensureStudyPresenceTable } from "../../../lib/study-presence";
import { ensureStudyRecordTables } from "../../../lib/study-records";

export async function GET(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const user = await getAuthenticatedDeviceUser(request, runtime.DB);
  if (!user) return Response.json({ error: "login required" }, { status: 401 });
  await ensureDeviceAuthTables(runtime.DB);
  await ensureGuardianReportTables(runtime.DB);
  await ensureStudyPresenceTable(runtime.DB);
  await ensureStudyRecordTables(runtime.DB);

  const today = jstDateKey();
  const liveAfterMs = Date.now() - 90_000;
  const { results = [] } = await runtime.DB.prepare(`WITH session_focus AS (
      SELECT student_id, COALESCE(SUM(active_seconds), 0) AS focus_seconds
      FROM study_session_totals
      WHERE summary_date = ? AND is_juku = 0
      GROUP BY student_id
    ), attempts AS (
      SELECT student_id, COUNT(*) AS questions_solved
      FROM practice_attempts
      WHERE date(attempted_at, '+9 hours') = ?
      GROUP BY student_id
    )
    SELECT
      u.id,
      u.display_name,
      u.created_at,
      CASE WHEN sf.student_id IS NOT NULL THEN COALESCE(sf.focus_seconds, 0) ELSE COALESCE(s.focus_seconds, 0) END AS focus_seconds,
      CASE WHEN a.student_id IS NOT NULL THEN COALESCE(a.questions_solved, 0) ELSE COALESCE(s.questions_solved, 0) END AS questions_solved,
      p.status AS presence_status,
      p.mode AS presence_mode,
      p.subject AS presence_subject,
      p.detail AS presence_detail,
      p.started_at_ms AS presence_started_at_ms,
      p.active_seconds AS presence_active_seconds,
      p.last_seen_at_ms AS presence_last_seen_at_ms
    FROM device_users u
    LEFT JOIN daily_summaries s ON s.student_id = u.id AND s.summary_date = ?
    LEFT JOIN session_focus sf ON sf.student_id = u.id
    LEFT JOIN attempts a ON a.student_id = u.id
    LEFT JOIN study_presence p ON p.student_id = u.id
    WHERE u.is_active = 1
    ORDER BY
      CASE WHEN p.status = 'studying' AND p.last_seen_at_ms >= ? THEN 0
           WHEN p.status = 'away' AND p.last_seen_at_ms >= ? THEN 1
           WHEN (CASE WHEN sf.student_id IS NOT NULL THEN COALESCE(sf.focus_seconds, 0) ELSE COALESCE(s.focus_seconds, 0) END) > 0
             OR (CASE WHEN a.student_id IS NOT NULL THEN COALESCE(a.questions_solved, 0) ELSE COALESCE(s.questions_solved, 0) END) > 0 THEN 2
           ELSE 3 END,
      CASE WHEN u.id = ? THEN 0 ELSE 1 END,
      (CASE WHEN sf.student_id IS NOT NULL THEN COALESCE(sf.focus_seconds, 0) ELSE COALESCE(s.focus_seconds, 0) END) DESC,
      u.created_at DESC
    LIMIT 100`)
    .bind(today, today, today, liveAfterMs, liveAfterMs, user.id)
    .all<Record<string, unknown>>();

  return Response.json({
    today,
    students: results
      .map((row) => {
        const isFresh = Number(row.presence_last_seen_at_ms ?? 0) >= liveAfterMs;
        const rawStatus = String(row.presence_status ?? "stopped");
        const focusSeconds = Number(row.focus_seconds ?? 0);
        const questionsSolved = Number(row.questions_solved ?? 0);
        const status = isFresh && rawStatus === "studying"
          ? "studying"
          : isFresh && rawStatus === "away"
            ? "away"
            : focusSeconds > 0 || questionsSolved > 0
              ? "studied_today"
              : "not_started";
        return {
          id: String(row.id),
          displayName: String(row.display_name),
          focusSeconds,
          questionsSolved,
          isMe: String(row.id) === user.id,
          status,
          mode: String(row.presence_mode ?? ""),
          subject: String(row.presence_subject ?? ""),
          detail: String(row.presence_detail ?? ""),
          startedAtMs: status === "studying" || status === "away" ? Number(row.presence_started_at_ms ?? 0) : 0,
          activeSeconds: status === "studying" || status === "away" ? Number(row.presence_active_seconds ?? 0) : 0,
        };
      }),
  });
}
