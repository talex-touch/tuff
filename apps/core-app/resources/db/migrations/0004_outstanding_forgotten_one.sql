CREATE TABLE IF NOT EXISTS `clipboard_history_meta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clipboard_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`clipboard_id`) REFERENCES `clipboard_history`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `file_index_progress` (
	`file_id` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`processed_bytes` integer,
	`total_bytes` integer,
	`last_error` text,
	`started_at` integer,
	`updated_at` integer DEFAULT '"1970-01-01T00:00:00.000Z"' NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ocr_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clipboard_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`payload_hash` text,
	`meta` text,
	`queued_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`clipboard_id`) REFERENCES `clipboard_history`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ocr_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`text` text NOT NULL,
	`confidence` real,
	`language` text,
	`checksum` text,
	`extra` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `ocr_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
