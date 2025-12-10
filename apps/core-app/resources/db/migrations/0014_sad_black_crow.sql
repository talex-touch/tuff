CREATE TABLE `intelligence_audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trace_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`capability_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_hash` text,
	`caller` text,
	`user_id` text,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost` real,
	`latency` integer NOT NULL,
	`success` integer NOT NULL,
	`error` text,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `intelligence_audit_logs_trace_id_unique` ON `intelligence_audit_logs` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_timestamp` ON `intelligence_audit_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_audit_caller` ON `intelligence_audit_logs` (`caller`);--> statement-breakpoint
CREATE INDEX `idx_audit_capability` ON `intelligence_audit_logs` (`capability_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_provider` ON `intelligence_audit_logs` (`provider`);--> statement-breakpoint
CREATE TABLE `intelligence_quotas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`caller_id` text NOT NULL,
	`caller_type` text NOT NULL,
	`requests_per_minute` integer,
	`requests_per_day` integer,
	`requests_per_month` integer,
	`tokens_per_minute` integer,
	`tokens_per_day` integer,
	`tokens_per_month` integer,
	`cost_limit_per_day` real,
	`cost_limit_per_month` real,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_quota_caller` ON `intelligence_quotas` (`caller_id`,`caller_type`);--> statement-breakpoint
CREATE TABLE `intelligence_usage_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`caller_id` text NOT NULL,
	`caller_type` text NOT NULL,
	`period` text NOT NULL,
	`period_type` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`total_cost` real DEFAULT 0 NOT NULL,
	`avg_latency` real DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	PRIMARY KEY(`caller_id`, `caller_type`, `period`)
);
--> statement-breakpoint
CREATE INDEX `idx_usage_period` ON `intelligence_usage_stats` (`period_type`,`period`);