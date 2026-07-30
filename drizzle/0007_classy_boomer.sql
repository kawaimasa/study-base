CREATE TABLE IF NOT EXISTS `daily_away_stats` (
	`student_id` text NOT NULL,
	`summary_date` text NOT NULL,
	`away_seconds` integer DEFAULT 0 NOT NULL,
	`away_count` integer DEFAULT 0 NOT NULL,
	`idle_seconds` integer DEFAULT 0 NOT NULL,
	`idle_count` integer DEFAULT 0 NOT NULL,
	`juku_away_seconds` integer DEFAULT 0 NOT NULL,
	`juku_away_count` integer DEFAULT 0 NOT NULL,
	`away_started_at` integer,
	`away_at_juku` integer DEFAULT false NOT NULL,
	`state_updated_at_ms` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `daily_away_stats_student_date_idx` ON `daily_away_stats` (`student_id`,`summary_date`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `study_session_totals` (
	`student_id` text NOT NULL,
	`session_id` text NOT NULL,
	`summary_date` text NOT NULL,
	`status` text DEFAULT 'stopped' NOT NULL,
	`mode` text DEFAULT 'study' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`is_juku` integer DEFAULT false NOT NULL,
	`active_seconds` integer DEFAULT 0 NOT NULL,
	`started_at_ms` integer DEFAULT 0 NOT NULL,
	`last_seen_at_ms` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `study_session_totals_student_session_idx` ON `study_session_totals` (`student_id`,`session_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `study_session_totals_student_date_idx` ON `study_session_totals` (`student_id`,`summary_date`,`is_juku`);
