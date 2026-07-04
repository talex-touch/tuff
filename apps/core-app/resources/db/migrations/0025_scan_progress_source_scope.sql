CREATE TABLE IF NOT EXISTS `scan_progress` (
  `source_id` text DEFAULT 'file-provider' NOT NULL,
  `path` text NOT NULL,
  `last_scanned` integer DEFAULT '"1970-01-01T00:00:00.000Z"' NOT NULL,
  PRIMARY KEY(`source_id`, `path`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_scan_progress_path`
ON `scan_progress` (`path`);
