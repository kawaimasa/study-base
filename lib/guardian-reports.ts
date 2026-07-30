import { ensureDeviceAuthTables } from "./device-auth";
import { ensureStudyPresenceTable } from "./study-presence";
import { ensureStudyRecordTables } from "./study-records";

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
  stateUpdatedAtMs?: number;
};

export async function ensureGuardianReportTables(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS guardian_profiles (
      student_id TEXT PRIMARY KEY,
      student_name TEXT NOT NULL,
      pairing_code TEXT NOT NULL UNIQUE,
      pairing_expires_at TEXT,
      pairing_used_at TEXT,
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
      state_updated_at_ms INTEGER NOT NULL DEFAULT 0,
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
  try {
    await db.prepare("ALTER TABLE daily_away_stats ADD COLUMN state_updated_at_ms INTEGER NOT NULL DEFAULT 0").run();
  } catch {
    // The column already exists on new or previously migrated databases.
  }
  const profileColumns = await db.prepare("PRAGMA table_info(guardian_profiles)").all<{ name: string }>();
  if (!(profileColumns.results ?? []).some((column) => column.name === "pairing_expires_at")) {
    try {
      await db.prepare("ALTER TABLE guardian_profiles ADD COLUMN pairing_expires_at TEXT").run();
    } catch {
      // Another request or a deployment migration may have added it first.
    }
  }
  if (!(profileColumns.results ?? []).some((column) => column.name === "pairing_used_at")) {
    try {
      await db.prepare("ALTER TABLE guardian_profiles ADD COLUMN pairing_used_at TEXT").run();
    } catch {
      // Another request or a deployment migration may have added it first.
    }
  }
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
  // Scheduled jobs can be the first request after a fresh deployment. Ensure
  // every table used below exists before the report query runs.
  await ensureDeviceAuthTables(env.DB);
  await ensureGuardianReportTables(env.DB);
  await ensureStudyPresenceTable(env.DB);
  await ensureStudyRecordTables(env.DB);
  const summaryDate = jstDateKey(scheduledTime, -1);
  const { results = [] } = await env.DB.prepare(`WITH verified_focus AS (
      SELECT student_id, SUM(active_seconds) AS focus_seconds
      FROM study_session_totals WHERE summary_date = ? AND is_juku = 0 GROUP BY student_id
    ), verified_attempts AS (
      SELECT student_id, COUNT(*) AS questions_solved,
        SUM(CASE WHEN result = 'correct' THEN 1 ELSE 0 END) AS correct_answers
      FROM practice_attempts WHERE date(attempted_at, '+9 hours') = ? GROUP BY student_id
    ), verified_away AS (
      SELECT student_id, away_seconds + idle_seconds AS away_seconds
      FROM daily_away_stats WHERE summary_date = ?
    )
    SELECT p.student_id, p.student_name, p.parent_line_user_id,
      COALESCE(s.summary_date, ?) AS summary_date,
      CASE WHEN vf.student_id IS NOT NULL THEN COALESCE(vf.focus_seconds, 0) ELSE COALESCE(s.focus_seconds, 0) END AS focus_seconds,
      CASE WHEN va.student_id IS NOT NULL THEN COALESCE(va.away_seconds, 0) ELSE COALESCE(s.away_seconds, 0) END AS away_seconds,
      CASE WHEN vt.student_id IS NOT NULL THEN COALESCE(vt.questions_solved, 0) ELSE COALESCE(s.questions_solved, 0) END AS questions_solved,
      CASE WHEN vt.student_id IS NOT NULL THEN COALESCE(vt.correct_answers, 0) ELSE COALESCE(s.correct_answers, 0) END AS correct_answers,
      CASE WHEN vt.student_id IS NOT NULL THEN COALESCE(vt.questions_solved, 0) - COALESCE(vt.correct_answers, 0) ELSE COALESCE(s.wrong_answers, 0) END AS wrong_answers
    FROM guardian_profiles p
    INNER JOIN device_users u ON u.id = p.student_id AND u.is_active = 1
    LEFT JOIN daily_summaries s ON s.student_id = p.student_id AND s.summary_date = ?
    LEFT JOIN verified_focus vf ON vf.student_id = p.student_id
    LEFT JOIN verified_attempts vt ON vt.student_id = p.student_id
    LEFT JOIN verified_away va ON va.student_id = p.student_id
    LEFT JOIN guardian_notification_logs l
      ON l.student_id = p.student_id AND l.summary_date = ?
    WHERE p.notifications_enabled = 1
      AND p.parent_consent_at IS NOT NULL
      AND p.parent_line_user_id IS NOT NULL
      AND (l.id IS NULL OR l.status = 'failed')
  `).bind(summaryDate, summaryDate, summaryDate, summaryDate, summaryDate, summaryDate).all<Record<string, unknown>>();

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
