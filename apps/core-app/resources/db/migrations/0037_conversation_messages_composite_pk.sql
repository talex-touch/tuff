CREATE TABLE IF NOT EXISTS `__new_conversation_messages` (
	`id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`meta` text,
	`seq` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`conversation_id`, `id`),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_conversation_messages` (`id`,`conversation_id`,`role`,`content`,`status`,`meta`,`seq`,`created_at`) SELECT `id`,`conversation_id`,`role`,`content`,`status`,`meta`,`seq`,`created_at` FROM `conversation_messages`;
--> statement-breakpoint
DROP TABLE `conversation_messages`;
--> statement-breakpoint
ALTER TABLE `__new_conversation_messages` RENAME TO `conversation_messages`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_conversation_messages_thread` ON `conversation_messages` (`conversation_id`,`seq`);
