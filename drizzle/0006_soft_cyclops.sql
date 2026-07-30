CREATE TABLE `practice_attempt_batches` (
	`batch_id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`attempt_count` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `practice_attempt_batches_student_idx` ON `practice_attempt_batches` (`student_id`,`created_at`);