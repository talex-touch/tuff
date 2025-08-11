CREATE TABLE `config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `contextual_embeddings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`context_text` text NOT NULL,
	`embedding` text NOT NULL,
	`model` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contextual_embeddings_session_id_unique` ON `contextual_embeddings` (`session_id`);--> statement-breakpoint
CREATE TABLE `embeddings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` text NOT NULL,
	`source_type` text NOT NULL,
	`embedding` text NOT NULL,
	`model` text NOT NULL,
	`content_hash` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `file_extensions` (
	`file_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text,
	PRIMARY KEY(`file_id`, `key`),
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`extension` text,
	`size` integer,
	`mtime` integer NOT NULL,
	`ctime` integer NOT NULL,
	`is_dir` integer DEFAULT false NOT NULL,
	`type` text DEFAULT 'file' NOT NULL,
	`content` text,
	`embedding_status` text DEFAULT 'none' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_path_unique` ON `files` (`path`);--> statement-breakpoint
CREATE TABLE `keyword_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`keyword` text NOT NULL,
	`item_id` text NOT NULL,
	`priority` real DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plugin_data` (
	`plugin_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	PRIMARY KEY(`plugin_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `usage_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text,
	`item_id` text NOT NULL,
	`source` text NOT NULL,
	`action` text NOT NULL,
	`keyword` text,
	`timestamp` integer NOT NULL,
	`context` text
);
--> statement-breakpoint
CREATE TABLE `usage_summary` (
	`item_id` text PRIMARY KEY NOT NULL,
	`click_count` integer DEFAULT 0 NOT NULL,
	`last_used` integer NOT NULL
);
