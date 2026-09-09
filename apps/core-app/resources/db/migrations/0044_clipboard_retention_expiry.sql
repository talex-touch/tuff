ALTER TABLE `clipboard_history` ADD `retention_expires_at` integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `clipboard_history_expiry_idx` ON `clipboard_history` (`retention_expires_at`) WHERE `retention_expires_at` IS NOT NULL AND COALESCE(`is_favorite`, 0) = 0;
