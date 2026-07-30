ALTER TABLE `device_users` ADD `is_active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `guardian_profiles` ADD `pairing_expires_at` text;--> statement-breakpoint
ALTER TABLE `guardian_profiles` ADD `pairing_used_at` text;