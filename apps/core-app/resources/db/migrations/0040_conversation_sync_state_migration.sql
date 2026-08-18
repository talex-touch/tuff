CREATE TABLE IF NOT EXISTS `conversation_sync_state` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`dirty_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_conversation_sync_state_dirty` ON `conversation_sync_state` (`dirty_at`);
--> statement-breakpoint
INSERT INTO `conversation_sync_state` (`conversation_id`, `dirty_at`, `deleted_at`)
SELECT `conversation_id`, `deleted_at`, `deleted_at`
FROM `conversation_sync_tombstones`
WHERE true
ON CONFLICT (`conversation_id`) DO UPDATE SET
	`dirty_at` = CASE
		WHEN excluded.`dirty_at` > `conversation_sync_state`.`dirty_at` THEN excluded.`dirty_at`
		ELSE `conversation_sync_state`.`dirty_at`
	END,
	`deleted_at` = CASE
		WHEN excluded.`dirty_at` >= `conversation_sync_state`.`dirty_at` THEN excluded.`deleted_at`
		ELSE `conversation_sync_state`.`deleted_at`
	END;
--> statement-breakpoint
DROP TABLE `conversation_sync_tombstones`;
