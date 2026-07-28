import { env } from "cloudflare:workers";
import { ensureDeviceAuthTables, getAuthenticatedDeviceUser, type DeviceAuthEnv } from "../../../lib/device-auth";
import { ensureGuardianReportTables, jstDateKey } from "../../../lib/guardian-reports";

export async function GET(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const user = await getAuthenticatedDeviceUser(request, runtime.DB);
  if (!user) return Response.json({ error: "login required" }, { status: 401 });

  await ensureDeviceAuthTables(runtime.DB);
  await ensureGuardianReportTables(runtime.DB);

  const today = jstDateKey();
  const { results = [] } = await runtime.DB.prepare(`SELECT
      u.id,
      u.display_name,
      u.created_at,
      COALESCE(s.focus_seconds, 0) AS focus_seconds,
      COALESCE(s.questions_solved, 0) AS questions_solved
    FROM device_users u
    LEFT JOIN daily_summaries s ON s.student_id = u.id AND s.summary_date = ?
    ORDER BY
      CASE WHEN u.id = ? THEN 0 ELSE 1 END,
      COALESCE(s.focus_seconds, 0) DESC,
      u.created_at DESC
    LIMIT 6`)
    .bind(today, user.id)
    .all<Record<string, unknown>>();

  return Response.json({
    today,
    students: results.map((row) => ({
      id: String(row.id),
      displayName: String(row.display_name),
      focusSeconds: Number(row.focus_seconds ?? 0),
      questionsSolved: Number(row.questions_solved ?? 0),
      isMe: String(row.id) === user.id,
    })),
  });
}
