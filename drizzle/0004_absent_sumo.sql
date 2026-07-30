CREATE TABLE `mistake_notes` (
	`student_id` text NOT NULL,
	`question_id` text NOT NULL,
	`question_key` text NOT NULL,
	`subject` text NOT NULL,
	`question_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`wrong_count` integer DEFAULT 1 NOT NULL,
	`last_wrong_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`mastered_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mistake_notes_student_question_idx` ON `mistake_notes` (`student_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `mistake_notes_student_status_idx` ON `mistake_notes` (`student_id`,`status`);--> statement-breakpoint
CREATE TABLE `practice_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` text NOT NULL,
	`question_id` text NOT NULL,
	`question_key` text NOT NULL,
	`subject` text NOT NULL,
	`answer_text` text DEFAULT '' NOT NULL,
	`result` text NOT NULL,
	`source` text DEFAULT 'practice' NOT NULL,
	`attempted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `practice_attempts_student_question_time_idx` ON `practice_attempts` (`student_id`,`question_id`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `practice_attempts_student_date_idx` ON `practice_attempts` (`student_id`,`attempted_at`);--> statement-breakpoint
CREATE TABLE `question_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` text NOT NULL,
	`question_id` text NOT NULL,
	`question_key` text NOT NULL,
	`subject` text NOT NULL,
	`first_delivered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_delivered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_deliveries_student_question_idx` ON `question_deliveries` (`student_id`,`question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `question_deliveries_student_key_idx` ON `question_deliveries` (`student_id`,`question_key`);--> statement-breakpoint
CREATE INDEX `question_deliveries_student_subject_idx` ON `question_deliveries` (`student_id`,`subject`);--> statement-breakpoint
CREATE TABLE `student_login_days` (
	`student_id` text NOT NULL,
	`login_date` text NOT NULL,
	`first_logged_in_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_login_days_student_date_idx` ON `student_login_days` (`student_id`,`login_date`);