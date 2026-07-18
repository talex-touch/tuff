CREATE TABLE `app_update_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `revision` integer DEFAULT 0 NOT NULL,
  `phase` text NOT NULL,
  `current_version` text NOT NULL,
  `target_version` text,
  `source` text,
  `channel` text NOT NULL,
  `release_tag` text,
  `download_task_id` text,
  `install_mode` text,
  `install_on_normal_quit` integer DEFAULT 1 NOT NULL,
  `previous_version` text,
  `recovery_available` integer DEFAULT 0 NOT NULL,
  `error_code` text,
  `error_message` text,
  `error_retryable` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `terminal_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_app_update_attempts_phase_updated` ON `app_update_attempts` (`phase`, `updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_app_update_attempts_release_tag` ON `app_update_attempts` (`release_tag`);
--> statement-breakpoint
CREATE INDEX `idx_app_update_attempts_download_task` ON `app_update_attempts` (`download_task_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_app_update_attempts_single_active`
ON `app_update_attempts` ((1))
WHERE `phase` NOT IN ('idle', 'healthy', 'recovered', 'failed');
