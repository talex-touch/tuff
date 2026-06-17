CREATE TABLE `intelligence_knowledge_documents` (
  `id` text PRIMARY KEY NOT NULL,
  `source_type` text NOT NULL,
  `source_uri` text,
  `title` text NOT NULL,
  `content_hash` text NOT NULL,
  `permission_scope` text DEFAULT 'default' NOT NULL,
  `metadata` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_knowledge_documents_source` ON `intelligence_knowledge_documents` (`source_type`);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_knowledge_documents_permission` ON `intelligence_knowledge_documents` (`permission_scope`);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_knowledge_documents_updated` ON `intelligence_knowledge_documents` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `intelligence_knowledge_chunks` (
  `id` text PRIMARY KEY NOT NULL,
  `document_id` text NOT NULL,
  `chunk_index` integer NOT NULL,
  `content` text NOT NULL,
  `content_hash` text NOT NULL,
  `token_estimate` integer DEFAULT 0 NOT NULL,
  `metadata` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`document_id`) REFERENCES `intelligence_knowledge_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_knowledge_chunks_document` ON `intelligence_knowledge_chunks` (`document_id`,`chunk_index`);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_knowledge_chunks_updated` ON `intelligence_knowledge_chunks` (`updated_at`);
--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS `intelligence_knowledge_chunks_fts` USING fts5(
  `chunk_id` UNINDEXED,
  `document_id` UNINDEXED,
  `title`,
  `content`,
  tokenize = 'unicode61'
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `intelligence_knowledge_chunks_ai`
AFTER INSERT ON `intelligence_knowledge_chunks`
BEGIN
  INSERT INTO `intelligence_knowledge_chunks_fts` (`chunk_id`, `document_id`, `title`, `content`)
  SELECT NEW.`id`, NEW.`document_id`, d.`title`, NEW.`content`
  FROM `intelligence_knowledge_documents` d
  WHERE d.`id` = NEW.`document_id`;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `intelligence_knowledge_chunks_au`
AFTER UPDATE ON `intelligence_knowledge_chunks`
BEGIN
  DELETE FROM `intelligence_knowledge_chunks_fts` WHERE `chunk_id` = OLD.`id`;
  INSERT INTO `intelligence_knowledge_chunks_fts` (`chunk_id`, `document_id`, `title`, `content`)
  SELECT NEW.`id`, NEW.`document_id`, d.`title`, NEW.`content`
  FROM `intelligence_knowledge_documents` d
  WHERE d.`id` = NEW.`document_id`;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `intelligence_knowledge_chunks_ad`
AFTER DELETE ON `intelligence_knowledge_chunks`
BEGIN
  DELETE FROM `intelligence_knowledge_chunks_fts` WHERE `chunk_id` = OLD.`id`;
END;
--> statement-breakpoint
CREATE TABLE `intelligence_context_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `owner` text NOT NULL,
  `status` text NOT NULL,
  `objective` text,
  `summary` text,
  `metadata` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `archived_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_context_sessions_owner_status` ON `intelligence_context_sessions` (`owner`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_context_sessions_updated` ON `intelligence_context_sessions` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `intelligence_context_turns` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `privacy_level` text NOT NULL,
  `token_estimate` integer DEFAULT 0 NOT NULL,
  `metadata` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `intelligence_context_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_context_turns_session` ON `intelligence_context_turns` (`session_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_context_turns_privacy` ON `intelligence_context_turns` (`privacy_level`);
--> statement-breakpoint
CREATE TABLE `intelligence_context_checkpoints` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `type` text NOT NULL,
  `reason` text NOT NULL,
  `summary` text,
  `context_scope` text DEFAULT 'light' NOT NULL,
  `metadata` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `intelligence_context_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_context_checkpoints_session` ON `intelligence_context_checkpoints` (`session_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_context_checkpoints_type` ON `intelligence_context_checkpoints` (`type`);
--> statement-breakpoint
CREATE TABLE `intelligence_compression_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `goal` text,
  `current_state` text,
  `decisions` text DEFAULT '[]' NOT NULL,
  `constraints` text DEFAULT '[]' NOT NULL,
  `artifacts` text DEFAULT '[]' NOT NULL,
  `open_questions` text DEFAULT '[]' NOT NULL,
  `source_turn_from` text,
  `source_turn_to` text,
  `metadata` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `intelligence_context_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_compression_snapshots_session` ON `intelligence_compression_snapshots` (`session_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `intelligence_memory_items` (
  `id` text PRIMARY KEY NOT NULL,
  `type` text NOT NULL,
  `scope` text NOT NULL,
  `content` text NOT NULL,
  `summary` text NOT NULL,
  `tags` text DEFAULT '[]' NOT NULL,
  `confidence` real DEFAULT 1 NOT NULL,
  `source_session_id` text,
  `source_turn_id` text,
  `privacy_level` text NOT NULL,
  `ttl` integer,
  `enabled` integer DEFAULT true NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `last_used_at` integer,
  `usage_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_memory_items_scope_type` ON `intelligence_memory_items` (`scope`,`type`);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_memory_items_enabled` ON `intelligence_memory_items` (`enabled`);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_memory_items_source_session` ON `intelligence_memory_items` (`source_session_id`);
--> statement-breakpoint
CREATE TABLE `intelligence_memory_tombstones` (
  `id` text PRIMARY KEY NOT NULL,
  `memory_id` text NOT NULL,
  `reason` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_memory_tombstones_memory` ON `intelligence_memory_tombstones` (`memory_id`);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_memory_tombstones_created` ON `intelligence_memory_tombstones` (`created_at`);
--> statement-breakpoint
CREATE TABLE `intelligence_context_package_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `scope` text NOT NULL,
  `trace_id` text,
  `token_budget` integer NOT NULL,
  `token_estimate` integer NOT NULL,
  `items` text DEFAULT '[]' NOT NULL,
  `metadata` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `intelligence_context_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_context_package_logs_session` ON `intelligence_context_package_logs` (`session_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_context_package_logs_trace` ON `intelligence_context_package_logs` (`trace_id`);
