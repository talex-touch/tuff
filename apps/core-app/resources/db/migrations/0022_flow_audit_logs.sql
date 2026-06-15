CREATE TABLE `flow_audit_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `session_id` text NOT NULL,
  `timestamp` integer NOT NULL,
  `sender_id` text NOT NULL,
  `sender_type` text NOT NULL,
  `target_id` text,
  `target_plugin_id` text,
  `target_type` text NOT NULL,
  `payload_type` text NOT NULL,
  `payload_size` integer,
  `state` text NOT NULL,
  `error_code` text,
  `error_message` text,
  `latency` integer,
  `metadata` text
);
--> statement-breakpoint
CREATE INDEX `idx_flow_audit_session` ON `flow_audit_logs` (`session_id`);
--> statement-breakpoint
CREATE INDEX `idx_flow_audit_timestamp` ON `flow_audit_logs` (`timestamp`);
--> statement-breakpoint
CREATE INDEX `idx_flow_audit_sender` ON `flow_audit_logs` (`sender_id`);
--> statement-breakpoint
CREATE INDEX `idx_flow_audit_target` ON `flow_audit_logs` (`target_plugin_id`);
--> statement-breakpoint
CREATE INDEX `idx_flow_audit_state` ON `flow_audit_logs` (`state`);
