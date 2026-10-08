ALTER TABLE `search_index_meta` ADD `fts_rowid` integer;
--> statement-breakpoint
ALTER TABLE `search_index_meta` ADD `document_hash` text;
--> statement-breakpoint
CREATE TABLE `search_index_maintenance_progress` (
  `task` text PRIMARY KEY NOT NULL,
  `cursor` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `search_index_pending_commits` (
  `commit_id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL,
  `deleted_records` text NOT NULL,
  `removed_indexed_items` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_search_index_pending_commits_source` ON `search_index_pending_commits` (`source_id`);
--> statement-breakpoint
CREATE TABLE `search_index_file_maintenance` (
  `task_id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL,
  `reason` text NOT NULL,
  `file_path` text NOT NULL,
  `expected_record` text,
  `cursor` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_search_index_file_maintenance_source` ON `search_index_file_maintenance` (`source_id`);
--> statement-breakpoint
CREATE INDEX `idx_search_index_file_maintenance_reason` ON `search_index_file_maintenance` (`source_id`, `reason`);
