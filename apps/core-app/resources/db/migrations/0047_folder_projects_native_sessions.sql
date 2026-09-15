CREATE TABLE IF NOT EXISTS `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`root_path` text NOT NULL,
	`name` text NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_opened_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uniq_projects_root` ON `projects` (`root_path`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_projects_archive_pin_recent` ON `projects` (`archived`,`pinned`,`last_opened_at`);
--> statement-breakpoint
ALTER TABLE `conversations` ADD `project_id` text REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_conversations_project_updated` ON `conversations` (`project_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `local_ai_cli_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`provider` text NOT NULL,
	`project_root` text NOT NULL,
	`native_session_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'available' NOT NULL,
	`origin` text DEFAULT 'tuff' NOT NULL,
	`expected_head_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uniq_local_ai_cli_sessions_native` ON `local_ai_cli_sessions` (`provider`,`project_root`,`native_session_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_local_ai_cli_sessions_project_recent` ON `local_ai_cli_sessions` (`project_id`,`last_seen_at`);
