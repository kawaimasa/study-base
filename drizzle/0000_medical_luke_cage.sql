CREATE TABLE `daily_summaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` text NOT NULL,
	`summary_date` text NOT NULL,
	`focus_seconds` integer DEFAULT 0 NOT NULL,
	`away_seconds` integer DEFAULT 0 NOT NULL,
	`questions_solved` integer DEFAULT 0 NOT NULL,
	`correct_answers` integer DEFAULT 0 NOT NULL,
	`wrong_answers` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_summaries_student_date_idx` ON `daily_summaries` (`student_id`,`summary_date`);--> statement-breakpoint
CREATE TABLE `guardian_notification_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` text NOT NULL,
	`summary_date` text NOT NULL,
	`status` text NOT NULL,
	`error_message` text,
	`sent_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guardian_notification_logs_student_date_idx` ON `guardian_notification_logs` (`student_id`,`summary_date`);--> statement-breakpoint
CREATE TABLE `guardian_profiles` (
	`student_id` text PRIMARY KEY NOT NULL,
	`student_name` text NOT NULL,
	`pairing_code` text NOT NULL,
	`parent_line_user_id` text,
	`notifications_enabled` integer DEFAULT false NOT NULL,
	`parent_consent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guardian_profiles_pairing_code_unique` ON `guardian_profiles` (`pairing_code`);