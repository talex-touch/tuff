CREATE TABLE `clipboard_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`raw_content` text,
	`thumbnail` text,
	`timestamp` integer NOT NULL,
	`source_app` text,
	`is_favorite` integer DEFAULT false,
	`metadata` text
);
