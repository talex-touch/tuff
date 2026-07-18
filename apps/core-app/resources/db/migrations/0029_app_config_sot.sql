CREATE TABLE `app_config_entries` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `revision` integer DEFAULT 0 NOT NULL CHECK (`revision` >= 0),
  `deleted` integer DEFAULT 0 NOT NULL CHECK (`deleted` IN (0, 1)),
  `updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_config_migration_state` (
  `id` text PRIMARY KEY NOT NULL,
  `phase` text NOT NULL CHECK (`phase` IN ('pending', 'completed', 'failed')),
  `backup_path` text,
  `imported_count` integer DEFAULT 0 NOT NULL CHECK (`imported_count` >= 0),
  `skipped_count` integer DEFAULT 0 NOT NULL CHECK (`skipped_count` >= 0),
  `failed_count` integer DEFAULT 0 NOT NULL CHECK (`failed_count` >= 0),
  `completed_at` integer,
  `updated_at` integer DEFAULT 0 NOT NULL
);
