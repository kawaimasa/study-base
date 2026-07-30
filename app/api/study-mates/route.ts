import { env } from "cloudflare:workers";
import { ensureDeviceAuthTables, getAuthenticatedDeviceUser, type DeviceAuthEnv } from "../../../lib/device-auth";
import { ensureGuardianReportTables, jstDateKey } from "../../../lib/guardian-reports";
import { ensureStudyPresenceTable } from "../../../lib/study-presence";

export async function GET(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const user = await getAuthenticatedDeviceUser(request, runtime.DB);
  if (!user) return Response.json({ error: "login required" }, { status: 401 });
  await ensureDeviceAuthTables(runtime.DB);
  await ensureGuardianReportTables(runtime.DB);
  await ensureStudyPresenceTable(runtime.DB);

  const today = jstDateKey();
  const liveAfterMs = Date.now() - 90_000;
  const { results = [] } = await runtime.DB.prepare(`WITH roster AS (
      SELECT
        g.student_id AS id,
        g.student_name AS display_name,
        g.created_at AS created_at,
        g.pairing_code AS pairing_code,
        g.notifications_enabled AS notifications_enabled
      FROM guardian_profiles g
      UNION ALL
      SELECT
        u.id AS id,
        u.display_name AS display_name,
        u.created_at AS created_at,
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
      p.status AS presence_status,
      p.mode AS presence_mode,
      p.subject AS presence_subject,
      p.detail AS presence_detail,
      p.started_at_ms AS presence_started_at_ms,
      p.active_seconds AS presence_active_seconds,
      p.last_seen_at_ms AS presence_last_seen_at_ms
    FROM roster
    LEFT JOIN daily_summaries s ON s.student_id = roster.id AND s.summary_date = ?
    LEFT JOIN study_presence p ON p.student_id = roster.id
    ORDER BY
      CASE WHEN p.status = 'studying' AND p.last_seen_at_ms >= ? THEN 0
           WHEN p.status = 'away' AND p.last_seen_at_ms >= ? THEN 1
           WHEN COALESCE(s.focus_seconds, 0) > 0 OR COALESCE(s.questions_solved, 0) > 0 THEN 2
           ELSE 3 END,
      CASE WHEN roster.id = ? THEN 0 ELSE 1 END,
      COALESCE(s.focus_seconds, 0) DESC,
      roster.created_at DESC
    LIMIT 6`)
    .bind(today, liveAfterMs, liveAfterMs, user.id)
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
