ALTER TABLE `local_ai_cli_sessions` ADD `conversation_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uniq_local_ai_cli_sessions_conversation` ON `local_ai_cli_sessions` (`conversation_id`);
