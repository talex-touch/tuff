CREATE INDEX `idx_chunks_task` ON `download_chunks` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_chunks_task_index` ON `download_chunks` (`task_id`,`index`);--> statement-breakpoint
CREATE INDEX `idx_history_created` ON `download_history` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_history_completed` ON `download_history` (`completed_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_status` ON `download_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_created` ON `download_tasks` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_priority` ON `download_tasks` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_tasks_status_priority` ON `download_tasks` (`status`,`priority`);