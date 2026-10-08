CREATE TABLE IF NOT EXISTS `app_foreground_activity` (
  `app_key` text PRIMARY KEY NOT NULL,
  `last_active_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_app_foreground_activity_last_active` ON `app_foreground_activity` (`last_active_at`);
