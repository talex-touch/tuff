CREATE TABLE IF NOT EXISTS `voice_insights_state` (
  `id` integer PRIMARY KEY NOT NULL,
  `generation` integer NOT NULL DEFAULT 0,
  `started_at` integer,
  `updated_at` integer NOT NULL,
  `timezone` text NOT NULL,
  `total_characters` integer NOT NULL DEFAULT 0,
  `total_duration_ms` integer NOT NULL DEFAULT 0,
  `session_count` integer NOT NULL DEFAULT 0,
  `polished_session_count` integer NOT NULL DEFAULT 0,
  `estimated_saved_ms` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `voice_insight_days` (
  `day` text PRIMARY KEY NOT NULL,
  `characters` integer NOT NULL DEFAULT 0,
  `duration_ms` integer NOT NULL DEFAULT 0,
  `session_count` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_voice_insight_days_day` ON `voice_insight_days` (`day`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `voice_insight_captures` (
  `capture_id` text PRIMARY KEY NOT NULL,
  `generation` integer NOT NULL,
  `captured_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_voice_insight_captures_captured_at` ON `voice_insight_captures` (`captured_at`);
