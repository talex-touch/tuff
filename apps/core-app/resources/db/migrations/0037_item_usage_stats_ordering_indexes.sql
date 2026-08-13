CREATE INDEX IF NOT EXISTS `item_usage_stats_execute_count_idx` ON `item_usage_stats` (`execute_count`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `item_usage_stats_last_executed_idx` ON `item_usage_stats` (`last_executed`);
