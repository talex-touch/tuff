CREATE TABLE `telemetry_upload_stats` (
  `id` integer PRIMARY KEY NOT NULL,
  `search_count` integer DEFAULT 0 NOT NULL,
  `total_uploads` integer DEFAULT 0 NOT NULL,
  `failed_uploads` integer DEFAULT 0 NOT NULL,
  `last_upload_time` integer,
  `last_failure_at` integer,
  `last_failure_message` text,
  `updated_at` integer DEFAULT 0 NOT NULL
);
INSERT OR IGNORE INTO `telemetry_upload_stats` (`id`) VALUES (1);

