import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const guardianProfiles = sqliteTable("guardian_profiles", {
  studentId: text("student_id").primaryKey(),
  studentName: text("student_name").notNull(),
  pairingCode: text("pairing_code").notNull().unique(),
  parentLineUserId: text("parent_line_user_id"),
  notificationsEnabled: integer("notifications_enabled", { mode: "boolean" }).notNull().default(false),
  parentConsentAt: text("parent_consent_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dailySummaries = sqliteTable("daily_summaries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  studentId: text("student_id").notNull(),
  summaryDate: text("summary_date").notNull(),
  focusSeconds: integer("focus_seconds").notNull().default(0),
  awaySeconds: integer("away_seconds").notNull().default(0),
  questionsSolved: integer("questions_solved").notNull().default(0),
  correctAnswers: integer("correct_answers").notNull().default(0),
  wrongAnswers: integer("wrong_answers").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("daily_summaries_student_date_idx").on(table.studentId, table.summaryDate)]);

/** One durable row for each student and JST calendar day they signed in. */
export const studentLoginDays = sqliteTable("student_login_days", {
  studentId: text("student_id").notNull(),
  loginDate: text("login_date").notNull(),
  firstLoggedInAt: text("first_logged_in_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("student_login_days_student_date_idx").on(table.studentId, table.loginDate)]);

/** Latest cross-device presence for the home screen's live study roster. */
export const studyPresence = sqliteTable("study_presence", {
  studentId: text("student_id").primaryKey(),
  sessionId: text("session_id").notNull(),
  status: text("status").notNull().default("stopped"),
  mode: text("mode").notNull().default("study"),
  subject: text("subject").notNull().default(""),
  detail: text("detail").notNull().default(""),
  startedAtMs: integer("started_at_ms").notNull().default(0),
  activeSeconds: integer("active_seconds").notNull().default(0),
  lastSeenAtMs: integer("last_seen_at_ms").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("study_presence_status_seen_idx").on(table.status, table.lastSeenAtMs)]);

/** Questions that have been shown to a student. This prevents accidental repeats. */
export const questionDeliveries = sqliteTable("question_deliveries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  studentId: text("student_id").notNull(),
  questionId: text("question_id").notNull(),
  questionKey: text("question_key").notNull(),
  subject: text("subject").notNull(),
  firstDeliveredAt: text("first_delivered_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastDeliveredAt: text("last_delivered_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("question_deliveries_student_question_idx").on(table.studentId, table.questionId),
  uniqueIndex("question_deliveries_student_key_idx").on(table.studentId, table.questionKey),
  index("question_deliveries_student_subject_idx").on(table.studentId, table.subject),
]);

/** Immutable answer history: the original answer and the student's self-grade. */
export const practiceAttempts = sqliteTable("practice_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  studentId: text("student_id").notNull(),
  questionId: text("question_id").notNull(),
  questionKey: text("question_key").notNull(),
  subject: text("subject").notNull(),
  answerText: text("answer_text").notNull().default(""),
  result: text("result").notNull(),
  source: text("source").notNull().default("practice"),
  attemptedAt: text("attempted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("practice_attempts_student_question_time_idx").on(table.studentId, table.questionId, table.attemptedAt),
  index("practice_attempts_student_date_idx").on(table.studentId, table.attemptedAt),
]);

/** Idempotency receipt for one self-graded practice set or review action. */
export const practiceAttemptBatches = sqliteTable("practice_attempt_batches", {
  batchId: text("batch_id").primaryKey(),
  studentId: text("student_id").notNull(),
  attemptCount: integer("attempt_count").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("practice_attempt_batches_student_idx").on(table.studentId, table.createdAt)]);

/** The active, student-specific retry queue. A correct retry marks it mastered. */
export const mistakeNotes = sqliteTable("mistake_notes", {
  studentId: text("student_id").notNull(),
  questionId: text("question_id").notNull(),
  questionKey: text("question_key").notNull(),
  subject: text("subject").notNull(),
  questionJson: text("question_json").notNull(),
  status: text("status").notNull().default("active"),
  wrongCount: integer("wrong_count").notNull().default(1),
  lastWrongAt: text("last_wrong_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  masteredAt: text("mastered_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("mistake_notes_student_question_idx").on(table.studentId, table.questionId),
  index("mistake_notes_student_status_idx").on(table.studentId, table.status),
]);

export const guardianNotificationLogs = sqliteTable("guardian_notification_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  studentId: text("student_id").notNull(),
  summaryDate: text("summary_date").notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  sentAt: text("sent_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("guardian_notification_logs_student_date_idx").on(table.studentId, table.summaryDate)]);

export const deviceUsers = sqliteTable("device_users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  deviceTokenHash: text("device_token_hash").notNull().unique(),
  pinSalt: text("pin_salt").notNull(),
  pinHash: text("pin_hash").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const deviceSessions = sqliteTable("device_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const adminUsers = sqliteTable("admin_users", {
  id: text("id").primaryKey(),
  loginId: text("login_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  pinSalt: text("pin_salt").notNull(),
  pinHash: text("pin_hash").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const adminSessions = sqliteTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  adminId: text("admin_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const weeklyTests = sqliteTable("weekly_tests", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  startsAt: text("starts_at").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  questionCount: integer("question_count").notNull(),
  subjectsJson: text("subjects_json").notNull(),
  questionsJson: text("questions_json").notNull(),
  status: text("status").notNull().default("published"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const weeklyTestSubmissions = sqliteTable("weekly_test_submissions", {
  testId: text("test_id").notNull(),
  studentId: text("student_id").notNull(),
  status: text("status").notNull().default("in_progress"),
  answersJson: text("answers_json").notNull().default("{}"),
  gradesJson: text("grades_json").notNull().default("{}"),
  correctAnswers: integer("correct_answers").notNull().default(0),
  totalQuestions: integer("total_questions").notNull().default(0),
  awaySeconds: integer("away_seconds").notNull().default(0),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  submittedAt: text("submitted_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("weekly_test_submissions_test_student_idx").on(table.testId, table.studentId)]);
