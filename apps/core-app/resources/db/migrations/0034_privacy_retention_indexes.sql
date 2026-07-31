ALTER TABLE `clipboard_history` ADD `retention_protected` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `clipboard_history_retention_idx` ON `clipboard_history` (`timestamp`, `id`) WHERE COALESCE(`is_favorite`, 0) = 0 AND COALESCE(`retention_protected`, 0) = 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ocr_jobs_retention_idx` ON `ocr_jobs` (COALESCE(`finished_at`, `queued_at`), `id`) WHERE `status` IN ('completed', 'failed', 'cancelled');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `query_completions_retention_idx` ON `query_completions` (`last_completed`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `contextual_embeddings_retention_idx` ON `contextual_embeddings` (`timestamp`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_logs_retention_idx` ON `usage_logs` (`timestamp`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_summary_retention_idx` ON `usage_summary` (`last_used`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `item_usage_stats_retention_idx` ON `item_usage_stats` (MAX(COALESCE(`last_searched`, 0), COALESCE(`last_executed`, 0), COALESCE(`last_cancelled`, 0), `updated_at`));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `recommendation_cache_retention_idx` ON `recommendation_cache` (`created_at`);
--> statement-breakpoint
ALTER TABLE `intelligence_context_sessions` ADD `is_pinned` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `intelligence_context_sessions_retention_idx` ON `intelligence_context_sessions` (`updated_at`, `id`) WHERE `status` IN ('archived', 'expired') AND COALESCE(`is_pinned`, 0) = 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `analytics_snapshots_retention_idx` ON `analytics_snapshots` (`timestamp`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `plugin_analytics_retention_idx` ON `plugin_analytics` (`timestamp`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_analytics_report_queue_created_at` ON `analytics_report_queue` (`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `telemetry_upload_stats_retention_idx` ON `telemetry_upload_stats` (`last_failure_at`, `id`);
