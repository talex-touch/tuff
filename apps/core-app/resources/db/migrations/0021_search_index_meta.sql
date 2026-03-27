CREATE TABLE `search_index_meta` (
  `provider_id` text NOT NULL,
  `item_id` text NOT NULL,
  `keyword_hash` text NOT NULL,
  `updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
  PRIMARY KEY(`provider_id`, `item_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_search_index_meta_updated_at` ON `search_index_meta` (`updated_at`);
