import { env } from "cloudflare:workers";
import { ensureGuardianReportTables, jstDateKey, type DailyAwayInput, type DailySummaryInput } from "../../../lib/guardian-reports";
import { getAuthenticatedDeviceUser } from "../../../lib/device-auth";
import { studentDailyFocusSeconds } from "../../../lib/study-presence";
import { studentRecordSnapshot } from "../../../lib/study-records";

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
  const away = await runtime.DB.prepare(`SELECT away_seconds, away_count, idle_seconds, idle_count, juku_away_seconds, juku_away_count, away_started_at, away_at_juku, state_updated_at_ms
    FROM daily_away_stats WHERE student_id = ? AND summary_date = ?`)
    .bind(user.id, jstDateKey()).first<Record<string, number>>();
  const today = jstDateKey();
  const [savedSummary, sessionFocus, records] = await Promise.all([
    runtime.DB.prepare(`SELECT focus_seconds, away_seconds, questions_solved, correct_answers, wrong_answers
      FROM daily_summaries WHERE student_id = ? AND summary_date = ?`)
      .bind(user.id, today).first<Record<string, number>>(),
    studentDailyFocusSeconds(runtime.DB, user.id, today),
    studentRecordSnapshot(runtime.DB, user.id),
  ]);
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
      stateUpdatedAtMs: Number(away.state_updated_at_ms ?? 0),
    } : null,
    summary: {
      summaryDate: today,
      // Both tables are durable mirrors of the same daily total. A newly
      // created zero-second session must never hide an already saved summary.
      focusSeconds: Math.max(sessionFocus, Number(savedSummary?.focus_seconds ?? 0)),
      awaySeconds: Number(savedSummary?.away_seconds ?? 0),
      questionsSolved: records.solved > 0 ? records.solved : Number(savedSummary?.questions_solved ?? 0),
      correctAnswers: records.solved > 0 ? records.correct : Number(savedSummary?.correct_answers ?? 0),
      wrongAnswers: records.solved > 0 ? records.wrong : Number(savedSummary?.wrong_answers ?? 0),
    },
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
    stateUpdatedAtMs: Math.max(0, Math.floor(Number(value.stateUpdatedAtMs) || 0)),
  };
}

async function saveAwayStats(db: D1Database, studentId: string, summaryDate: string, input: DailyAwayInput) {
  const away = normalizeAway(input);
  await db.prepare(`INSERT INTO daily_away_stats
    (student_id, summary_date, away_seconds, away_count, idle_seconds, idle_count, juku_away_seconds, juku_away_count, away_started_at, away_at_juku, state_updated_at_ms, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, summary_date) DO UPDATE SET
      away_seconds = MAX(daily_away_stats.away_seconds, excluded.away_seconds),
      away_count = MAX(daily_away_stats.away_count, excluded.away_count),
      idle_seconds = MAX(daily_away_stats.idle_seconds, excluded.idle_seconds),
      idle_count = MAX(daily_away_stats.idle_count, excluded.idle_count),
      juku_away_seconds = MAX(daily_away_stats.juku_away_seconds, excluded.juku_away_seconds),
      juku_away_count = MAX(daily_away_stats.juku_away_count, excluded.juku_away_count),
      away_started_at = CASE WHEN excluded.state_updated_at_ms >= daily_away_stats.state_updated_at_ms THEN excluded.away_started_at ELSE daily_away_stats.away_started_at END,
      away_at_juku = CASE WHEN excluded.state_updated_at_ms >= daily_away_stats.state_updated_at_ms THEN excluded.away_at_juku ELSE daily_away_stats.away_at_juku END,
      state_updated_at_ms = MAX(daily_away_stats.state_updated_at_ms, excluded.state_updated_at_ms),
      updated_at = CURRENT_TIMESTAMP`)
    .bind(studentId, summaryDate, away.awaySeconds, away.awayCount, away.idleSeconds, away.idleCount, away.jukuAwaySeconds, away.jukuAwayCount, away.awayStartedAt, away.awayAtJuku ? 1 : 0, away.stateUpdatedAtMs ?? 0)
    .run();
}

export async function POST(request: Request) {
  let payload: {
    action?: "settings" | "summary" | "away";
    summaryDate?: string;
    summary?: DailySummaryInput;
    away?: DailyAwayInput;
  };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
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
    const sessionFocus = await studentDailyFocusSeconds(runtime.DB, studentId, summaryDate);
    const records = summaryDate === jstDateKey() ? await studentRecordSnapshot(runtime.DB, studentId) : null;
    const focusSeconds = Math.max(0, Number(summary.focusSeconds) || 0, sessionFocus);
    const questionsSolved = Math.max(0, Number(summary.questionsSolved) || 0, Number(records?.solved ?? 0));
    const correctAnswers = Math.max(0, Number(summary.correctAnswers) || 0, Number(records?.correct ?? 0));
    const wrongAnswers = Math.max(0, Number(summary.wrongAnswers) || 0, Number(records?.wrong ?? 0));
    await runtime.DB.prepare(`INSERT INTO daily_summaries
      (student_id, summary_date, focus_seconds, away_seconds, questions_solved, correct_answers, wrong_answers, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(student_id, summary_date) DO UPDATE SET
        focus_seconds = MAX(daily_summaries.focus_seconds, excluded.focus_seconds),
        away_seconds = MAX(daily_summaries.away_seconds, excluded.away_seconds),
        questions_solved = MAX(daily_summaries.questions_solved, excluded.questions_solved),
        correct_answers = MAX(daily_summaries.correct_answers, excluded.correct_answers),
        wrong_answers = MAX(daily_summaries.wrong_answers, excluded.wrong_answers),
        updated_at = CURRENT_TIMESTAMP`)
      .bind(studentId, summaryDate, focusSeconds, Math.max(0, Number(summary.awaySeconds) || 0), questionsSolved, correctAnswers, wrongAnswers)
      .run();
    return Response.json({ saved: true, summaryDate });
  }

  return Response.json({ error: "invalid action" }, { status: 400 });
}
