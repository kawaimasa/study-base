import { env } from "cloudflare:workers";
import { ensureGuardianReportTables, jstDateKey, type DailyAwayInput, type DailySummaryInput } from "../../../lib/guardian-reports";
import { getAuthenticatedDeviceUser } from "../../../lib/device-auth";

type GuardianEnv = {
  DB: D1Database;
};

export async function GET(request: Request) {
  const runtime = env as unknown as GuardianEnv;
  await ensureGuardianReportTables(runtime.DB);
  const user = await getAuthenticatedDeviceUser(request, runtime.DB);
  if (!user) return Response.json({ error: "login required" }, { status: 401 });
  const profile = await runtime.DB.prepare("SELECT notifications_enabled FROM guardian_profiles WHERE student_id = ?")
    .bind(user.id).first<{ notifications_enabled: number }>();
  const away = await runtime.DB.prepare(`SELECT away_seconds, away_count, idle_seconds, idle_count, juku_away_seconds, juku_away_count, away_started_at, away_at_juku
    FROM daily_away_stats WHERE student_id = ? AND summary_date = ?`)
    .bind(user.id, jstDateKey()).first<Record<string, number>>();
  return Response.json({
    profile: profile ? { enabled: Boolean(profile.notifications_enabled) } : null,
    away: away ? {
      awaySeconds: Number(away.away_seconds ?? 0),
      awayCount: Number(away.away_count ?? 0),
      idleSeconds: Number(away.idle_seconds ?? 0),
      idleCount: Number(away.idle_count ?? 0),
      jukuAwaySeconds: Number(away.juku_away_seconds ?? 0),
      jukuAwayCount: Number(away.juku_away_count ?? 0),
      awayStartedAt: away.away_started_at ? Number(away.away_started_at) : null,
      awayAtJuku: Boolean(away.away_at_juku),
    } : null,
  });
}

function normalizeAway(value: DailyAwayInput): DailyAwayInput {
  return {
    awaySeconds: Math.max(0, Math.floor(Number(value.awaySeconds) || 0)),
    awayCount: Math.max(0, Math.floor(Number(value.awayCount) || 0)),
    idleSeconds: Math.max(0, Math.floor(Number(value.idleSeconds) || 0)),
    idleCount: Math.max(0, Math.floor(Number(value.idleCount) || 0)),
    jukuAwaySeconds: Math.max(0, Math.floor(Number(value.jukuAwaySeconds) || 0)),
    jukuAwayCount: Math.max(0, Math.floor(Number(value.jukuAwayCount) || 0)),
    awayStartedAt: Number.isFinite(Number(value.awayStartedAt)) && Number(value.awayStartedAt) > 0 ? Math.floor(Number(value.awayStartedAt)) : null,
    awayAtJuku: Boolean(value.awayAtJuku),
  };
}

async function saveAwayStats(db: D1Database, studentId: string, summaryDate: string, input: DailyAwayInput) {
  const away = normalizeAway(input);
  await db.prepare(`INSERT INTO daily_away_stats
    (student_id, summary_date, away_seconds, away_count, idle_seconds, idle_count, juku_away_seconds, juku_away_count, away_started_at, away_at_juku, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, summary_date) DO UPDATE SET
      away_seconds = MAX(daily_away_stats.away_seconds, excluded.away_seconds),
      away_count = MAX(daily_away_stats.away_count, excluded.away_count),
      idle_seconds = MAX(daily_away_stats.idle_seconds, excluded.idle_seconds),
      idle_count = MAX(daily_away_stats.idle_count, excluded.idle_count),
      juku_away_seconds = MAX(daily_away_stats.juku_away_seconds, excluded.juku_away_seconds),
      juku_away_count = MAX(daily_away_stats.juku_away_count, excluded.juku_away_count),
      away_started_at = excluded.away_started_at,
      away_at_juku = excluded.away_at_juku,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(studentId, summaryDate, away.awaySeconds, away.awayCount, away.idleSeconds, away.idleCount, away.jukuAwaySeconds, away.jukuAwayCount, away.awayStartedAt, away.awayAtJuku ? 1 : 0)
    .run();
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    action?: "settings" | "summary" | "away";
    summaryDate?: string;
    summary?: DailySummaryInput;
    away?: DailyAwayInput;
  };
  const runtime = env as unknown as GuardianEnv;
  await ensureGuardianReportTables(runtime.DB);
  const user = await getAuthenticatedDeviceUser(request, runtime.DB);
  if (!user) return Response.json({ error: "login required" }, { status: 401 });
  const studentId = user.id;

  if (payload.action === "settings") {
    return Response.json({ error: "guardian settings are admin only" }, { status: 403 });
  }

  const summaryDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.summaryDate ?? "") ? payload.summaryDate! : jstDateKey();

  if (payload.away && (payload.action === "summary" || payload.action === "away")) {
    await saveAwayStats(runtime.DB, studentId, summaryDate, payload.away);
  }

  if (payload.action === "away" && payload.away) {
    return Response.json({ saved: true, summaryDate });
  }

  if (payload.action === "summary" && payload.summary) {
    const summary = payload.summary;
    await runtime.DB.prepare(`INSERT INTO daily_summaries
      (student_id, summary_date, focus_seconds, away_seconds, questions_solved, correct_answers, wrong_answers, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(student_id, summary_date) DO UPDATE SET
        focus_seconds = excluded.focus_seconds,
        away_seconds = excluded.away_seconds,
        questions_solved = excluded.questions_solved,
        correct_answers = excluded.correct_answers,
        wrong_answers = excluded.wrong_answers,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(studentId, summaryDate, Math.max(0, summary.focusSeconds), Math.max(0, summary.awaySeconds), Math.max(0, summary.questionsSolved), Math.max(0, summary.correctAnswers), Math.max(0, summary.wrongAnswers))
      .run();
    return Response.json({ saved: true, summaryDate });
  }

  return Response.json({ error: "invalid action" }, { status: 400 });
}
