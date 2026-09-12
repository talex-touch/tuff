CREATE TABLE IF NOT EXISTS `voice_polish_telemetry` (
  `id` text PRIMARY KEY NOT NULL,
  `day` text NOT NULL,
  `captured_at` integer NOT NULL,
  `tier` text NOT NULL,
  `units` integer NOT NULL,
  `characters` integer NOT NULL,
  `outcome` text NOT NULL,
  `strength` text,
  `requested_strength` text,
  `latency_ms` integer NOT NULL DEFAULT 0,
  `polished_characters` integer NOT NULL DEFAULT 0,
  `generation` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_voice_polish_telemetry_day` ON `voice_polish_telemetry` (`day`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_voice_polish_telemetry_captured_at` ON `voice_polish_telemetry` (`captured_at`);
