CREATE TABLE IF NOT EXISTS `ai_import_scans` (
  `id` text PRIMARY KEY NOT NULL,
  `cwd` text NOT NULL,
  `sources` text DEFAULT '[]' NOT NULL,
  `candidates` text DEFAULT '[]' NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_import_scans_created` ON `ai_import_scans` (`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_import_sources` (
  `id` text PRIMARY KEY NOT NULL,
  `scan_id` text NOT NULL,
  `provider` text NOT NULL,
  `label` text NOT NULL,
  `scope` text NOT NULL,
  `root_path` text NOT NULL,
  `executable_path` text,
  `installed` integer DEFAULT false NOT NULL,
  `fingerprint` text NOT NULL,
  `warnings` text DEFAULT '[]' NOT NULL,
  `scanned_at` integer NOT NULL,
  FOREIGN KEY (`scan_id`) REFERENCES `ai_import_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_import_sources_scan` ON `ai_import_sources` (`scan_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_import_sources_provider` ON `ai_import_sources` (`provider`,`scope`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_import_revisions` (
  `id` text PRIMARY KEY NOT NULL,
  `scan_id` text NOT NULL,
  `imported_count` integer DEFAULT 0 NOT NULL,
  `unchanged_count` integer DEFAULT 0 NOT NULL,
  `removed_count` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`scan_id`) REFERENCES `ai_import_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_import_revisions_scan` ON `ai_import_revisions` (`scan_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_import_revisions_created` ON `ai_import_revisions` (`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_import_items` (
  `id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL,
  `provider` text NOT NULL,
  `scope` text NOT NULL,
  `kind` text NOT NULL,
  `name` text NOT NULL,
  `path` text NOT NULL,
  `fingerprint` text NOT NULL,
  `snapshot` text NOT NULL,
  `revision_id` text NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`revision_id`) REFERENCES `ai_import_revisions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_import_items_source` ON `ai_import_items` (`source_id`,`active`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_import_items_provider_kind` ON `ai_import_items` (`provider`,`kind`,`active`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_import_items_revision` ON `ai_import_items` (`revision_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_agent_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `runtime_provider` text NOT NULL,
  `enabled` integer DEFAULT true NOT NULL,
  `system_prompt` text,
  `model_preference` text DEFAULT '[]' NOT NULL,
  `allowed_tool_ids` text DEFAULT '[]' NOT NULL,
  `enabled_skill_ids` text DEFAULT '[]' NOT NULL,
  `permission_policy` text NOT NULL,
  `timeout_ms` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_agent_profiles_enabled` ON `ai_agent_profiles` (`enabled`,`updated_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_orchestrator_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `automation_id` text,
  `session_id` text NOT NULL,
  `objective` text NOT NULL,
  `profile_id` text NOT NULL,
  `runtime_provider` text NOT NULL,
  `cwd` text NOT NULL,
  `status` text NOT NULL,
  `output` text,
  `error` text,
  `usage` text,
  `metadata` text,
  `created_at` integer NOT NULL,
  `started_at` integer,
  `completed_at` integer,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_orchestrator_runs_status` ON `ai_orchestrator_runs` (`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_orchestrator_runs_automation` ON `ai_orchestrator_runs` (`automation_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_orchestrator_runs_session` ON `ai_orchestrator_runs` (`session_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_orchestrator_events` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `seq` integer NOT NULL,
  `type` text NOT NULL,
  `level` text NOT NULL,
  `payload` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `ai_orchestrator_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_orchestrator_events_run_seq` ON `ai_orchestrator_events` (`run_id`,`seq`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_orchestrator_events_created` ON `ai_orchestrator_events` (`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_automations` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `enabled` integer DEFAULT true NOT NULL,
  `objective` text NOT NULL,
  `input` text,
  `profile_id` text NOT NULL,
  `trigger` text NOT NULL,
  `approval_mode` text NOT NULL,
  `cwd` text,
  `timeout_ms` integer,
  `metadata` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_automations_enabled` ON `ai_automations` (`enabled`,`updated_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_automations_profile` ON `ai_automations` (`profile_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_automation_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `automation_id` text NOT NULL,
  `orchestrator_run_id` text,
  `trigger_type` text NOT NULL,
  `status` text NOT NULL,
  `approved` integer DEFAULT false NOT NULL,
  `missed_count` integer DEFAULT 0 NOT NULL,
  `payload` text,
  `error` text,
  `created_at` integer NOT NULL,
  `started_at` integer,
  `completed_at` integer,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`automation_id`) REFERENCES `ai_automations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_automation_runs_automation_status` ON `ai_automation_runs` (`automation_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_automation_runs_orchestrator` ON `ai_automation_runs` (`orchestrator_run_id`);
