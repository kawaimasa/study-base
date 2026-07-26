CREATE TABLE `weekly_test_submissions` (
	`test_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`answers_json` text DEFAULT '{}' NOT NULL,
	`grades_json` text DEFAULT '{}' NOT NULL,
	`correct_answers` integer DEFAULT 0 NOT NULL,
	`total_questions` integer DEFAULT 0 NOT NULL,
	`away_seconds` integer DEFAULT 0 NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`submitted_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_test_submissions_test_student_idx` ON `weekly_test_submissions` (`test_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `weekly_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`question_count` integer NOT NULL,
	`subjects_json` text NOT NULL,
	`questions_json` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
