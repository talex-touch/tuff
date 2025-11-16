CREATE TABLE `download_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`index` integer NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`size` integer NOT NULL,
	`downloaded` integer DEFAULT 0,
	`status` text NOT NULL,
	`file_path` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `download_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `download_history` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`url` text NOT NULL,
	`filename` text NOT NULL,
	`module` text NOT NULL,
	`status` text NOT NULL,
	`total_size` integer,
	`downloaded_size` integer,
	`duration` integer,
	`average_speed` integer,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `download_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`destination` text NOT NULL,
	`filename` text NOT NULL,
	`priority` integer NOT NULL,
	`module` text NOT NULL,
	`status` text NOT NULL,
	`total_size` integer,
	`downloaded_size` integer DEFAULT 0,
	`checksum` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`error` text
);
