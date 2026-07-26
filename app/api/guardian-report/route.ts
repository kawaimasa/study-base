import { env } from "cloudflare:workers";
import { ensureGuardianReportTables, jstDateKey, type DailySummaryInput } from "../../../lib/guardian-reports";
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
  return Response.json({
    profile: profile ? { enabled: Boolean(profile.notifications_enabled) } : null,
  });
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    action?: "settings" | "summary";
    summaryDate?: string;
    summary?: DailySummaryInput;
  };
  const runtime = env as unknown as GuardianEnv;
  await ensureGuardianReportTables(runtime.DB);
  const user = await getAuthenticatedDeviceUser(request, runtime.DB);
  if (!user) return Response.json({ error: "login required" }, { status: 401 });
  const studentId = user.id;

  if (payload.action === "settings") {
    return Response.json({ error: "guardian settings are admin only" }, { status: 403 });
  }

  if (payload.action === "summary" && payload.summary) {
    const summary = payload.summary;
    const summaryDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.summaryDate ?? "") ? payload.summaryDate! : jstDateKey();
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
