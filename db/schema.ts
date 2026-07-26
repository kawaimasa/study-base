import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
