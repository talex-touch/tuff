CREATE TABLE `item_time_stats` (
	`source_id` text NOT NULL,
	`item_id` text NOT NULL,
	`hour_distribution` text NOT NULL,
	`day_of_week_distribution` text NOT NULL,
	`time_slot_distribution` text NOT NULL,
	`last_updated` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	PRIMARY KEY(`source_id`, `item_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_item_time_stats_updated` ON `item_time_stats` (`last_updated`);
--> statement-breakpoint
CREATE TABLE `recommendation_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`recommended_items` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_recommendation_cache_expires` ON `recommendation_cache` (`expires_at`);
