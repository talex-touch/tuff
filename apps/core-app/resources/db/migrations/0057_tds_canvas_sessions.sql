CREATE TABLE IF NOT EXISTS `tds_canvas_sessions` (
  `key_hash` text PRIMARY KEY NOT NULL,
  `envelope` text NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tds_canvas_sessions_updated` ON `tds_canvas_sessions` (`updated_at`);
