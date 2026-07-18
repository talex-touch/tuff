ALTER TABLE `app_update_attempts`
ADD `rollback_compatible` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `app_update_attempts`
ADD `rollback_from_version` text;
