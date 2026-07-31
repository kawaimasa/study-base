export type StudyRecordQuestion = {
  id: string;
  key: string;
  subject: string;
  payload: Record<string, unknown>;
};

export type AttemptResult = "correct" | "wrong";

export type PracticeAttemptInput = {
  question: StudyRecordQuestion;
  result: AttemptResult;
  answerText?: string;
  source?: string;
};

function jstDateKey(timestamp = Date.now()) {
  const date = new Date(timestamp + 9 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * These tables are the source of truth for student activity. Browser storage
 * may cache an in-progress screen, but it must never be the only record.
 */
export async function ensureStudyRecordTables(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS student_login_days (
      student_id TEXT NOT NULL,
      login_date TEXT NOT NULL,
      first_logged_in_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (student_id, login_date)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS question_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      question_key TEXT NOT NULL,
      subject TEXT NOT NULL,
      first_delivered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_delivered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (student_id, question_id),
      UNIQUE (student_id, question_key)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS question_deliveries_student_subject_idx ON question_deliveries(student_id, subject)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS question_catalog (
      question_id TEXT PRIMARY KEY,
      question_key TEXT NOT NULL,
      subject TEXT NOT NULL,
      question_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS question_catalog_subject_idx ON question_catalog(subject)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS practice_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      question_key TEXT NOT NULL,
      subject TEXT NOT NULL,
      answer_text TEXT NOT NULL DEFAULT '',
      result TEXT NOT NULL CHECK (result IN ('correct', 'wrong')),
      source TEXT NOT NULL DEFAULT 'practice',
      attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS practice_attempts_student_question_time_idx ON practice_attempts(student_id, question_id, attempted_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS practice_attempts_student_date_idx ON practice_attempts(student_id, attempted_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS practice_attempt_batches (
      batch_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS practice_attempt_batches_student_idx ON practice_attempt_batches(student_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS mistake_notes (
      student_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      question_key TEXT NOT NULL,
      subject TEXT NOT NULL,
      question_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'mastered')),
      wrong_count INTEGER NOT NULL DEFAULT 1,
      last_wrong_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      mastered_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (student_id, question_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS mistake_notes_student_status_idx ON mistake_notes(student_id, status)"),
  ]);
}

export async function recordStudentLogin(db: D1Database, studentId: string, timestamp = Date.now()) {
  await ensureStudyRecordTables(db);
  const loginDate = jstDateKey(timestamp);
  await db.prepare("INSERT OR IGNORE INTO student_login_days (student_id, login_date) VALUES (?, ?)")
    .bind(studentId, loginDate).run();
  return loginDate;
}

function assertQuestion(question: StudyRecordQuestion) {
  if (!question || typeof question.id !== "string" || !question.id.trim()) throw new Error("question id is required");
  if (typeof question.key !== "string" || !question.key.trim()) throw new Error("question key is required");
  if (typeof question.subject !== "string" || !question.subject.trim()) throw new Error("question subject is required");
}

export async function recordQuestionDeliveries(db: D1Database, studentId: string, questions: StudyRecordQuestion[]) {
  await ensureStudyRecordTables(db);
  const unique = new Map<string, StudyRecordQuestion>();
  for (const question of questions) {
    assertQuestion(question);
    unique.set(question.key, question);
  }
  if (unique.size === 0) return;
  await db.batch([...unique.values()].flatMap((question) => [
    db.prepare(`INSERT INTO question_catalog
      (question_id, question_key, subject, question_json, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(question_id) DO UPDATE SET
        question_key = excluded.question_key,
        subject = excluded.subject,
        question_json = excluded.question_json,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(question.id, question.key, question.subject, JSON.stringify(question.payload)),
    db.prepare(`INSERT OR IGNORE INTO question_deliveries
      (student_id, question_id, question_key, subject) VALUES (?, ?, ?, ?)`)
      .bind(studentId, question.id, question.key, question.subject),
    db.prepare(`UPDATE question_deliveries SET last_delivered_at = CURRENT_TIMESTAMP
      WHERE student_id = ? AND (question_id = ? OR question_key = ?)`)
      .bind(studentId, question.id, question.key),
  ]));
}

export async function recordPracticeAttempt(
  db: D1Database,
  studentId: string,
  question: StudyRecordQuestion,
  result: AttemptResult,
  answerText = "",
  source = "practice",
) {
  assertQuestion(question);
  if (result !== "correct" && result !== "wrong") throw new Error("invalid grading result");
  await ensureStudyRecordTables(db);
  await recordQuestionDeliveries(db, studentId, [question]);
  const statements = [
    db.prepare(`INSERT INTO practice_attempts
      (student_id, question_id, question_key, subject, answer_text, result, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(studentId, question.id, question.key, question.subject, answerText.slice(0, 500), result, source),
  ];

  if (result === "wrong") {
    statements.push(db.prepare(`INSERT INTO mistake_notes
      (student_id, question_id, question_key, subject, question_json, status, wrong_count, last_wrong_at, mastered_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 1, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(student_id, question_id) DO UPDATE SET
        question_key = excluded.question_key,
        subject = excluded.subject,
        question_json = excluded.question_json,
        status = 'active',
        wrong_count = mistake_notes.wrong_count + 1,
        last_wrong_at = CURRENT_TIMESTAMP,
        mastered_at = NULL,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(studentId, question.id, question.key, question.subject, JSON.stringify(question.payload)));
  } else {
    statements.push(db.prepare(`UPDATE mistake_notes
      SET status = 'mastered', mastered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE student_id = ? AND question_id = ? AND status = 'active'`)
      .bind(studentId, question.id));
  }
  await db.batch(statements);
}

function buildAttemptStatements(db: D1Database, studentId: string, attempt: PracticeAttemptInput) {
  const { question, result } = attempt;
  assertQuestion(question);
  if (result !== "correct" && result !== "wrong") throw new Error("invalid grading result");
  const statements = [
    db.prepare(`INSERT INTO question_catalog
      (question_id, question_key, subject, question_json, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(question_id) DO UPDATE SET
        question_key = excluded.question_key,
        subject = excluded.subject,
        question_json = excluded.question_json,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(question.id, question.key, question.subject, JSON.stringify(question.payload)),
    db.prepare(`INSERT OR IGNORE INTO question_deliveries
      (student_id, question_id, question_key, subject, first_delivered_at, last_delivered_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .bind(studentId, question.id, question.key, question.subject),
    db.prepare(`UPDATE question_deliveries SET last_delivered_at = CURRENT_TIMESTAMP
      WHERE student_id = ? AND (question_id = ? OR question_key = ?)`)
      .bind(studentId, question.id, question.key),
    db.prepare(`INSERT INTO practice_attempts
      (student_id, question_id, question_key, subject, answer_text, result, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        studentId,
        question.id,
        question.key,
        question.subject,
        String(attempt.answerText ?? "").slice(0, 500),
        result,
        String(attempt.source ?? "practice").slice(0, 50),
      ),
  ];
  if (result === "wrong") {
    statements.push(db.prepare(`INSERT INTO mistake_notes
      (student_id, question_id, question_key, subject, question_json, status, wrong_count, last_wrong_at, mastered_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 1, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(student_id, question_id) DO UPDATE SET
        question_key = excluded.question_key,
        subject = excluded.subject,
        question_json = excluded.question_json,
        status = 'active',
        wrong_count = mistake_notes.wrong_count + 1,
        last_wrong_at = CURRENT_TIMESTAMP,
        mastered_at = NULL,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(studentId, question.id, question.key, question.subject, JSON.stringify(question.payload)));
  } else {
    statements.push(db.prepare(`UPDATE mistake_notes
      SET status = 'mastered', mastered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE student_id = ? AND question_id = ? AND status = 'active'`)
      .bind(studentId, question.id));
  }
  return statements;
}

/** Saves one self-graded set atomically. A stable batch id makes retries safe. */
export async function recordPracticeAttemptBatch(
  db: D1Database,
  studentId: string,
  batchId: string,
  attempts: PracticeAttemptInput[],
) {
  const normalizedBatchId = batchId.trim().slice(0, 120);
  if (!normalizedBatchId) throw new Error("batch id is required");
  if (attempts.length < 1 || attempts.length > 80) throw new Error("attempts must contain 1 to 80 items");
  await ensureStudyRecordTables(db);
  const existing = await db.prepare("SELECT batch_id FROM practice_attempt_batches WHERE batch_id = ? AND student_id = ?")
    .bind(normalizedBatchId, studentId).first();
  if (existing) return { saved: true, duplicate: true, attempts: attempts.length };

  const statements = [
    db.prepare("INSERT INTO practice_attempt_batches (batch_id, student_id, attempt_count) VALUES (?, ?, ?)")
      .bind(normalizedBatchId, studentId, attempts.length),
  ];
  for (const attempt of attempts) statements.push(...buildAttemptStatements(db, studentId, attempt));
  try {
    await db.batch(statements);
  } catch (error) {
    const raced = await db.prepare("SELECT batch_id FROM practice_attempt_batches WHERE batch_id = ? AND student_id = ?")
      .bind(normalizedBatchId, studentId).first();
    if (raced) return { saved: true, duplicate: true, attempts: attempts.length };
    throw error;
  }
  return { saved: true, duplicate: false, attempts: attempts.length };
}

export async function studentRecordSnapshot(db: D1Database, studentId: string) {
  await ensureStudyRecordTables(db);
  const today = jstDateKey();
  const [login, attempts, mistakes, deliveries] = await db.batch([
    db.prepare("SELECT COUNT(*) AS login_days FROM student_login_days WHERE student_id = ?").bind(studentId),
    db.prepare(`SELECT COUNT(*) AS solved, COALESCE(SUM(CASE WHEN result = 'correct' THEN 1 ELSE 0 END), 0) AS correct,
      COALESCE(SUM(CASE WHEN result = 'wrong' THEN 1 ELSE 0 END), 0) AS wrong
      FROM practice_attempts WHERE student_id = ? AND date(attempted_at, '+9 hours') = ?`).bind(studentId, today),
    db.prepare("SELECT COUNT(*) AS active_mistakes FROM mistake_notes WHERE student_id = ? AND status = 'active'").bind(studentId),
    db.prepare("SELECT COUNT(*) AS delivered FROM question_deliveries WHERE student_id = ?").bind(studentId),
  ]);
  return {
    today,
    loginDays: Number((login.results?.[0] as { login_days?: number } | undefined)?.login_days ?? 0),
    solved: Number((attempts.results?.[0] as { solved?: number } | undefined)?.solved ?? 0),
    correct: Number((attempts.results?.[0] as { correct?: number } | undefined)?.correct ?? 0),
    wrong: Number((attempts.results?.[0] as { wrong?: number } | undefined)?.wrong ?? 0),
    activeMistakes: Number((mistakes.results?.[0] as { active_mistakes?: number } | undefined)?.active_mistakes ?? 0),
    delivered: Number((deliveries.results?.[0] as { delivered?: number } | undefined)?.delivered ?? 0),
  };
}
