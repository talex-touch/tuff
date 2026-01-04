CREATE TABLE `analytics_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `window_type` text NOT NULL,
  `timestamp` integer NOT NULL,
  `metrics` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `idx_analytics_snapshots_window_time` ON `analytics_snapshots` (`window_type`, `timestamp`);
--> statement-breakpoint
CREATE TABLE `plugin_analytics` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `plugin_name` text NOT NULL,
  `feature_id` text,
  `event_type` text NOT NULL,
  `count` integer DEFAULT 1,
  `metadata` text,
  `timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plugin_analytics_plugin_time` ON `plugin_analytics` (`plugin_name`, `timestamp`);
