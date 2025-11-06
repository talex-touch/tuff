ALTER TABLE `item_usage_stats` ADD `cancel_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `item_usage_stats` ADD `last_cancelled` integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_item_usage_source_type ON item_usage_stats(source_type);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_item_usage_updated ON item_usage_stats(updated_at DESC);