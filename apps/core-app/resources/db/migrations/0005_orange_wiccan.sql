CREATE TABLE `item_usage_stats` (
	`source_id` text NOT NULL,
	`item_id` text NOT NULL,
	`source_type` text NOT NULL,
	`search_count` integer DEFAULT 0 NOT NULL,
	`execute_count` integer DEFAULT 0 NOT NULL,
	`last_searched` integer,
	`last_executed` integer,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	PRIMARY KEY(`source_id`, `item_id`)
);
