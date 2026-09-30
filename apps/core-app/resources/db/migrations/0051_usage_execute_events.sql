CREATE TABLE IF NOT EXISTS `usage_execute_events` (
  `event_id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL,
  `item_id` text NOT NULL,
  `source_type` text NOT NULL,
  `timestamp` integer NOT NULL,
  `day` integer NOT NULL,
  `created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_usage_execute_events_source_item` ON `usage_execute_events` (`source_id`, `item_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_usage_execute_events_retained` ON `usage_execute_events` (`timestamp`, `event_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_usage_execute_events_day` ON `usage_execute_events` (`day`);
--> statement-breakpoint
ALTER TABLE `usage_logs` ADD `event_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `usage_logs_event_idx` ON `usage_logs` (`event_id`) WHERE `event_id` IS NOT NULL;
