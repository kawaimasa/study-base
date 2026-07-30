import { env } from "cloudflare:workers";
import { ensureDeviceAuthTables, getAuthenticatedDeviceUser, type DeviceAuthEnv } from "../../../lib/device-auth";
import { ensureGuardianReportTables, jstDateKey } from "../../../lib/guardian-reports";
import { ensureStudyRecordTables } from "../../../lib/study-records";

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

  const period = normalizePeriod(new URL(request.url).searchParams.get("period"));
  const today = jstDateKey();
  const startDate = periodStart(period, today);
  const { results = [] } = await runtime.DB.prepare(`WITH roster AS (
      SELECT g.student_id AS id, g.student_name AS display_name, g.created_at AS created_at
      FROM guardian_profiles g
      UNION ALL
      SELECT u.id AS id, u.display_name AS display_name, u.created_at AS created_at
      FROM device_users u
      WHERE NOT EXISTS (SELECT 1 FROM guardian_profiles g WHERE g.student_id = u.id)
    ), totals AS (
      SELECT student_id,
        COALESCE(SUM(focus_seconds), 0) AS focus_seconds,
        COALESCE(SUM(questions_solved), 0) AS questions_solved
      FROM daily_summaries
      WHERE summary_date BETWEEN ? AND ?
      GROUP BY student_id
    )
    SELECT roster.id, roster.display_name,
      COALESCE(totals.focus_seconds, 0) AS focus_seconds,
      COALESCE(totals.questions_solved, 0) AS questions_solved
    FROM roster
    LEFT JOIN totals ON totals.student_id = roster.id
    ORDER BY COALESCE(totals.focus_seconds, 0) DESC,
      COALESCE(totals.questions_solved, 0) DESC,
      roster.display_name ASC,
      roster.created_at ASC
    LIMIT 100`).bind(startDate, today).all<Record<string, unknown>>();

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

  return Response.json({
    period,
    startDate,
    endDate: today,
    myRank: entries.find((entry) => entry.isMe)?.rank ?? null,
    entries,
  });
}
