CREATE TABLE IF NOT EXISTS `conversation_sync_tombstones` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`deleted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_conversation_sync_tombstones_deleted` ON `conversation_sync_tombstones` (`deleted_at`);
