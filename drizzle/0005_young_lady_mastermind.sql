CREATE TABLE `study_presence` (
	`student_id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`status` text DEFAULT 'stopped' NOT NULL,
	`mode` text DEFAULT 'study' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`started_at_ms` integer DEFAULT 0 NOT NULL,
	`active_seconds` integer DEFAULT 0 NOT NULL,
	`last_seen_at_ms` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `study_presence_status_seen_idx` ON `study_presence` (`status`,`last_seen_at_ms`);