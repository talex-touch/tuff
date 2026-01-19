CREATE TABLE `usage_trend_daily` (
  `source_id` text NOT NULL,
  `item_id` text NOT NULL,
  `day` integer NOT NULL,
  `execute_count` integer DEFAULT 0 NOT NULL,
  `updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
  PRIMARY KEY(`source_id`, `item_id`, `day`)
);
--> statement-breakpoint
CREATE INDEX `idx_usage_trend_daily_day` ON `usage_trend_daily` (`day`);
--> statement-breakpoint
CREATE INDEX `idx_usage_trend_daily_source_item` ON `usage_trend_daily` (`source_id`, `item_id`);
