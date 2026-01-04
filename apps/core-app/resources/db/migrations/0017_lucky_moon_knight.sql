CREATE TABLE `analytics_report_queue` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `endpoint` text NOT NULL,
  `payload` text NOT NULL,
  `created_at` integer NOT NULL,
  `retry_count` integer DEFAULT 0 NOT NULL,
  `last_attempt_at` integer,
  `last_error` text
);
CREATE INDEX `idx_analytics_report_queue_created_at` ON `analytics_report_queue` (`created_at`);
