CREATE TABLE `voice_provider_entries` (
  `pack_type` text NOT NULL,
  `pack_id` text NOT NULL,
  `pack_version` text NOT NULL,
  `provider_id` text NOT NULL,
  `protocol` text NOT NULL,
  `transport` text NOT NULL,
  `display_name_json` text NOT NULL,
  `base_url` text NOT NULL,
  `submit_path` text NOT NULL,
  `poll_path` text,
  `auth_mode` text NOT NULL,
  `auth_ref` text,
  `request_body` text NOT NULL,
  `content_type_policy` text NOT NULL,
  `headers_json` text,
  `idempotency_header` text,
  `models_json` text NOT NULL,
  `limits_json` text NOT NULL,
  `expiry_at` integer,
  PRIMARY KEY (`pack_type`, `pack_id`, `pack_version`, `provider_id`),
  FOREIGN KEY (`pack_type`, `pack_id`, `pack_version`) REFERENCES `catalog_packs` (`type`, `pack_id`, `version`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_voice_provider_entries_pack` ON `voice_provider_entries` (`pack_type`, `pack_id`, `pack_version`);
