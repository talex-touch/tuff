CREATE TABLE IF NOT EXISTS `indexed_source_task_state` (
  `source_id` text PRIMARY KEY NOT NULL,
  `state_json` text NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_indexed_source_task_state_updated_at`
ON `indexed_source_task_state` (`updated_at`);
--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS `search_index` USING fts5(
  `item_id` UNINDEXED,
  `provider` UNINDEXED,
  `type` UNINDEXED,
  `title`,
  `title_compact`,
  `keywords`,
  `tags`,
  `path`,
  `content`,
  tokenize = 'unicode61 remove_diacritics 2'
);
