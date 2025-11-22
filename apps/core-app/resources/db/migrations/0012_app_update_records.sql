CREATE TABLE `app_update_records` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `tag` text NOT NULL UNIQUE,
  `channel` text NOT NULL,
  `name` text,
  `source` text NOT NULL DEFAULT 'github',
  `published_at` integer,
  `fetched_at` integer NOT NULL,
  `payload` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `snooze_until` integer,
  `last_action_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_app_update_records_channel` ON `app_update_records` (`channel`, `fetched_at`);
