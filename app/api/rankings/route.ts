import { env } from "cloudflare:workers";
import { ensureDeviceAuthTables, getAuthenticatedDeviceUser, type DeviceAuthEnv } from "../../../lib/device-auth";
import { ensureGuardianReportTables, jstDateKey } from "../../../lib/guardian-reports";
import { ensureStudyRecordTables } from "../../../lib/study-records";
import { ensureStudyPresenceTable } from "../../../lib/study-presence";

type RankingPeriod = "today" | "week" | "month";

function normalizePeriod(value: string | null): RankingPeriod {
  return value === "week" || value === "month" ? value : "today";
}

function periodStart(period: RankingPeriod, today: string) {
  if (period === "month") return `${today.slice(0, 7)}-01`;
  if (period === "week") {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    const daysFromMonday = (weekday + 6) % 7;
    return jstDateKey(Date.now(), -daysFromMonday);
  }
  return today;
}

function previousDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const user = await getAuthenticatedDeviceUser(request, runtime.DB);
  if (!user) return Response.json({ error: "login required" }, { status: 401 });

  await ensureDeviceAuthTables(runtime.DB);
  await ensureGuardianReportTables(runtime.DB);
  await ensureStudyRecordTables(runtime.DB);
  await ensureStudyPresenceTable(runtime.DB);

  const period = normalizePeriod(new URL(request.url).searchParams.get("period"));
  const today = jstDateKey();
  const startDate = periodStart(period, today);
  const { results = [] } = await runtime.DB.prepare(`WITH session_daily AS (
      SELECT student_id, summary_date, COALESCE(SUM(active_seconds), 0) AS focus_seconds
      FROM study_session_totals
      WHERE summary_date BETWEEN ? AND ? AND is_juku = 0
      GROUP BY student_id, summary_date
    ), attempt_daily AS (
      SELECT student_id, date(attempted_at, '+9 hours') AS summary_date, COUNT(*) AS questions_solved
      FROM practice_attempts
      WHERE date(attempted_at, '+9 hours') BETWEEN ? AND ?
      GROUP BY student_id, date(attempted_at, '+9 hours')
    ), days AS (
      SELECT student_id, summary_date FROM daily_summaries WHERE summary_date BETWEEN ? AND ?
      UNION
      SELECT student_id, summary_date FROM session_daily
      UNION
      SELECT student_id, summary_date FROM attempt_daily
    ), totals AS (
      SELECT d.student_id,
        COALESCE(SUM(MAX(COALESCE(sf.focus_seconds, 0), COALESCE(s.focus_seconds, 0))), 0) AS focus_seconds,
        COALESCE(SUM(MAX(COALESCE(a.questions_solved, 0), COALESCE(s.questions_solved, 0))), 0) AS questions_solved
      FROM days d
      LEFT JOIN daily_summaries s ON s.student_id = d.student_id AND s.summary_date = d.summary_date
      LEFT JOIN session_daily sf ON sf.student_id = d.student_id AND sf.summary_date = d.summary_date
      LEFT JOIN attempt_daily a ON a.student_id = d.student_id AND a.summary_date = d.summary_date
      GROUP BY d.student_id
    )
    SELECT u.id, u.display_name,
      COALESCE(totals.focus_seconds, 0) AS focus_seconds,
      COALESCE(totals.questions_solved, 0) AS questions_solved
    FROM device_users u
    LEFT JOIN totals ON totals.student_id = u.id
    WHERE u.is_active = 1
    ORDER BY COALESCE(totals.focus_seconds, 0) DESC,
      COALESCE(totals.questions_solved, 0) DESC,
      u.display_name ASC,
      u.created_at ASC
    LIMIT 100`).bind(startDate, today, startDate, today, startDate, today).all<Record<string, unknown>>();

  const loginRows = await runtime.DB.prepare(`SELECT student_id, login_date
    FROM student_login_days WHERE login_date <= ? ORDER BY student_id, login_date DESC`)
    .bind(today).all<{ student_id: string; login_date: string }>();
  const loginDates = new Map<string, Set<string>>();
  for (const row of loginRows.results ?? []) {
    const dates = loginDates.get(row.student_id) ?? new Set<string>();
    dates.add(row.login_date);
    loginDates.set(row.student_id, dates);
  }

  let previousScore: string | null = null;
  let previousRank = 0;
  const entries = results.map((row, index) => {
    const id = String(row.id);
    const focusSeconds = Math.max(0, Number(row.focus_seconds ?? 0));
    const questionsSolved = Math.max(0, Number(row.questions_solved ?? 0));
    const score = `${focusSeconds}:${questionsSolved}`;
    const rank = score === previousScore ? previousRank : index + 1;
    previousScore = score;
    previousRank = rank;

    const dates = loginDates.get(id) ?? new Set<string>();
    let streak = 0;
    let cursor = today;
    while (dates.has(cursor)) {
      streak += 1;
      cursor = previousDate(cursor);
    }

    return {
      id,
      displayName: String(row.display_name),
      rank,
      focusSeconds,
      questionsSolved,
      streak,
      isMe: id === user.id,
    };
  });

  const publicEntries = entries.map((entry, index) => entry.isMe
    ? entry
    : {
        ...entry,
        id: `classmate-${index + 1}`,
        displayName: `仲間${index + 1}`,
        questionsSolved: 0,
        streak: 0,
      });

  return Response.json({
    period,
    startDate,
    endDate: today,
    myRank: entries.find((entry) => entry.isMe)?.rank ?? null,
    // The leaderboard remains useful without exposing classmates' registered
    // names or detailed study records to another student.
    entries: publicEntries,
  });
}
