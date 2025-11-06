CREATE TABLE `query_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prefix` text NOT NULL,
	`source_id` text NOT NULL,
	`item_id` text NOT NULL,
	`completion_count` integer DEFAULT 1 NOT NULL,
	`last_completed` integer NOT NULL,
	`avg_query_length` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
