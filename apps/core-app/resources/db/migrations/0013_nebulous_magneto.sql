CREATE TABLE IF NOT EXISTS `pinned_items` (
	`source_id` text NOT NULL,
	`item_id` text NOT NULL,
	`source_type` text NOT NULL,
	`pinned_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`source_id`, `item_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_pinned_items_order` ON `pinned_items` (`order`);
