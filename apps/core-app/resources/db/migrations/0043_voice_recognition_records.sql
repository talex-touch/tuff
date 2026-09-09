CREATE TABLE IF NOT EXISTS `voice_recognition_records` (
  `id` text PRIMARY KEY NOT NULL,
  `captured_at` integer NOT NULL,
  `source` text NOT NULL,
  `status` text NOT NULL,
  `audio_path` text,
  `audio_bytes` integer,
  `audio_duration_ms` integer,
  `recognition_duration_ms` integer,
  `raw_text` text,
  `text` text,
  `provider_id` text,
  `model` text,
  `channel` text,
  `input_tokens` integer,
  `output_tokens` integer,
  `total_tokens` integer,
  `error_code` text,
  `delivery_method` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_voice_recognition_records_captured_at` ON `voice_recognition_records` (`captured_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_voice_recognition_records_status` ON `voice_recognition_records` (`status`);