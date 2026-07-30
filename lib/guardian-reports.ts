export interface GuardianReportEnv {
  DB: D1Database;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
}

export type DailySummaryInput = {
  focusSeconds: number;
  awaySeconds: number;
  questionsSolved: number;
  correctAnswers: number;
  wrongAnswers: number;
};

/** Daily away data is separate from the guardian summary so navigation never
 * resets a student's count before the next report sync. */
export type DailyAwayInput = {
  awaySeconds: number;
  awayCount: number;
  idleSeconds: number;
  idleCount: number;
  jukuAwaySeconds: number;
  jukuAwayCount: number;
  awayStartedAt?: number | null;
  awayAtJuku?: boolean;
};

export async function ensureGuardianReportTables(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS guardian_profiles (
      student_id TEXT PRIMARY KEY,
      student_name TEXT NOT NULL,
      pairing_code TEXT NOT NULL UNIQUE,
      parent_line_user_id TEXT,
      notifications_enabled INTEGER NOT NULL DEFAULT 0,
      parent_consent_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS daily_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      summary_date TEXT NOT NULL,
      focus_seconds INTEGER NOT NULL DEFAULT 0,
      away_seconds INTEGER NOT NULL DEFAULT 0,
      questions_solved INTEGER NOT NULL DEFAULT 0,
      correct_answers INTEGER NOT NULL DEFAULT 0,
      wrong_answers INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, summary_date)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS daily_away_stats (
      student_id TEXT NOT NULL,
      summary_date TEXT NOT NULL,
      away_seconds INTEGER NOT NULL DEFAULT 0,
      away_count INTEGER NOT NULL DEFAULT 0,
      idle_seconds INTEGER NOT NULL DEFAULT 0,
      idle_count INTEGER NOT NULL DEFAULT 0,
      juku_away_seconds INTEGER NOT NULL DEFAULT 0,
      juku_away_count INTEGER NOT NULL DEFAULT 0,
      away_started_at INTEGER,
      away_at_juku INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(student_id, summary_date)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS guardian_notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      summary_date TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, summary_date)
    )`),
  ]);
}

export function jstDateKey(timestamp = Date.now(), dayOffset = 0) {
  const jstDate = new Date(timestamp + 9 * 60 * 60 * 1000);
  jstDate.setUTCDate(jstDate.getUTCDate() + dayOffset);
  return `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth() + 1).padStart(2, "0")}-${String(jstDate.getUTCDate()).padStart(2, "0")}`;
}

function formatMinutes(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}時間${rest}分` : `${minutes}分`;
}

function buildReportMessage(row: Record<string, unknown>) {
  const solved = Number(row.questions_solved ?? 0);
  const correct = Number(row.correct_answers ?? 0);
  const accuracy = solved > 0 ? Math.round((correct / solved) * 100) : 0;
  return [
    `【STUDY BASE｜昨日の学習レポート】`,
    `${String(row.student_name)}さんの ${String(row.summary_date)} の記録です。`,
    ``,
    `集中時間：${formatMinutes(Number(row.focus_seconds ?? 0))}`,
    `離脱時間：${formatMinutes(Number(row.away_seconds ?? 0))}`,
    `解いた問題：${solved}問`,
    `正解：${correct}問／間違い：${Number(row.wrong_answers ?? 0)}問`,
    `正答率：${accuracy}%`,
    ``,
    solved > 0 ? `今日も小さな一歩を応援してあげてください。` : `昨日は記録がありませんでした。責めずに、今日の一歩を応援してください。`,
  ].join("\n");
}

async function sendLinePush(token: string, userId: string, text: string) {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ to: userId, messages: [{ type: "text", text }] }),
  });
  if (!response.ok) throw new Error(`LINE push failed (${response.status})`);
}

export async function sendMorningGuardianReports(env: GuardianReportEnv, scheduledTime = Date.now()) {
  await ensureGuardianReportTables(env.DB);
  const summaryDate = jstDateKey(scheduledTime, -1);
  const { results = [] } = await env.DB.prepare(`
    SELECT p.student_id, p.student_name, p.parent_line_user_id,
      COALESCE(s.summary_date, ?) AS summary_date,
      COALESCE(s.focus_seconds, 0) AS focus_seconds,
      COALESCE(s.away_seconds, 0) AS away_seconds,
      COALESCE(s.questions_solved, 0) AS questions_solved,
      COALESCE(s.correct_answers, 0) AS correct_answers,
      COALESCE(s.wrong_answers, 0) AS wrong_answers
    FROM guardian_profiles p
    LEFT JOIN daily_summaries s ON s.student_id = p.student_id AND s.summary_date = ?
    LEFT JOIN guardian_notification_logs l
      ON l.student_id = p.student_id AND l.summary_date = ?
    WHERE p.notifications_enabled = 1
      AND p.parent_consent_at IS NOT NULL
      AND p.parent_line_user_id IS NOT NULL
      AND (l.id IS NULL OR l.status = 'failed')
  `).bind(summaryDate, summaryDate, summaryDate).all<Record<string, unknown>>();

  for (const row of results) {
    const studentId = String(row.student_id);
    try {
      if (!env.LINE_CHANNEL_ACCESS_TOKEN) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
      await sendLinePush(env.LINE_CHANNEL_ACCESS_TOKEN, String(row.parent_line_user_id), buildReportMessage(row));
      await env.DB.prepare(`INSERT INTO guardian_notification_logs (student_id, summary_date, status) VALUES (?, ?, 'sent')`)
        .bind(studentId, summaryDate).run();
    } catch (error) {
      await env.DB.prepare(`INSERT INTO guardian_notification_logs (student_id, summary_date, status, error_message)
        VALUES (?, ?, 'failed', ?)
        ON CONFLICT(student_id, summary_date) DO UPDATE SET status = 'failed', error_message = excluded.error_message, sent_at = CURRENT_TIMESTAMP`)
        .bind(studentId, summaryDate, error instanceof Error ? error.message : "Unknown error").run();
    }
  }

  return { summaryDate, targets: results.length };
}
