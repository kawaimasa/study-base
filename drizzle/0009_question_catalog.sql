CREATE TABLE IF NOT EXISTS `question_catalog` (
	`question_id` text PRIMARY KEY NOT NULL,
	`question_key` text NOT NULL,
	`subject` text NOT NULL,
	`question_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `question_catalog_subject_idx` ON `question_catalog` (`subject`);
