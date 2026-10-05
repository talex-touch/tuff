CREATE TABLE IF NOT EXISTS `conversation_workspaces` (
  `conversation_id` text PRIMARY KEY NOT NULL REFERENCES `conversations`(`id`) ON DELETE cascade,
  `settings_json` text NOT NULL,
  `status` text DEFAULT 'idle' NOT NULL,
  `queue_held` integer DEFAULT 0 NOT NULL,
  `active_turn_id` text,
  `run_id` text,
  `context_json` text,
  `pending_run_json` text,
  `revision` integer DEFAULT 0 NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `conversation_queued_inputs` (
  `id` text NOT NULL,
  `conversation_id` text NOT NULL REFERENCES `conversations`(`id`) ON DELETE cascade,
  `input_json` text NOT NULL,
  `input_hash` text NOT NULL,
  `priority` integer,
  `position` integer NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`conversation_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_conversation_queue_order` ON `conversation_queued_inputs` (`conversation_id`, `position`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `conversation_workspace_receipts` (
  `conversation_id` text NOT NULL REFERENCES `conversations`(`id`) ON DELETE cascade,
  `id` text NOT NULL,
  `input_hash` text NOT NULL,
  `status` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`conversation_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `conversation_attachments` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL REFERENCES `conversations`(`id`) ON DELETE cascade,
  `relative_path` text NOT NULL,
  `mime_type` text NOT NULL,
  `name` text,
  `size` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_conversation_attachments_owner` ON `conversation_attachments` (`conversation_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `conversation_message_attachments` (
  `conversation_id` text NOT NULL,
  `message_id` text NOT NULL,
  `attachment_id` text NOT NULL REFERENCES `conversation_attachments`(`id`) ON DELETE cascade,
  PRIMARY KEY (`conversation_id`, `message_id`, `attachment_id`),
  FOREIGN KEY (`conversation_id`, `message_id`) REFERENCES `conversation_messages`(`conversation_id`, `id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `conversation_file_reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL REFERENCES `conversations`(`id`) ON DELETE cascade,
  `run_id` text NOT NULL,
  `turn_id` text NOT NULL,
  `project_id` text NOT NULL,
  `public_json` text NOT NULL,
  `record_json` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_conversation_file_reviews_owner` ON `conversation_file_reviews` (`conversation_id`, `created_at`);
