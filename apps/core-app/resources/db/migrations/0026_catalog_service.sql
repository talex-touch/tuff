CREATE TABLE `catalog_packs` (
  `type` text NOT NULL,
  `pack_id` text NOT NULL,
  `version` text NOT NULL,
  `schema_version` integer NOT NULL,
  `payload_sha256` text NOT NULL,
  `payload_bytes` integer NOT NULL,
  `entry_count` integer NOT NULL,
  `locales_json` text NOT NULL,
  `min_sdkapi` integer NOT NULL,
  `source` text NOT NULL,
  `signature_status` text NOT NULL,
  `status` text NOT NULL,
  `created_at` integer NOT NULL,
  `imported_at` integer NOT NULL,
  `activated_at` integer,
  PRIMARY KEY (`type`, `pack_id`, `version`)
);
--> statement-breakpoint
CREATE INDEX `idx_catalog_packs_type_status` ON `catalog_packs` (`type`, `status`);
--> statement-breakpoint
CREATE TABLE `catalog_domain_lexicon_entries` (
  `pack_type` text NOT NULL,
  `pack_id` text NOT NULL,
  `pack_version` text NOT NULL,
  `entry_id` text NOT NULL,
  `domain` text NOT NULL,
  `labels_json` text NOT NULL,
  `aliases_json` text NOT NULL,
  `search_boost_json` text,
  `deprecated` integer DEFAULT false NOT NULL,
  `replaced_by` text,
  `metadata_json` text,
  PRIMARY KEY (`pack_type`, `pack_id`, `pack_version`, `entry_id`),
  FOREIGN KEY (`pack_type`, `pack_id`, `pack_version`) REFERENCES `catalog_packs` (`type`, `pack_id`, `version`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_catalog_domain_lexicon_entries_pack` ON `catalog_domain_lexicon_entries` (`pack_type`, `pack_id`, `pack_version`);
--> statement-breakpoint
CREATE TABLE `catalog_state` (
  `type` text PRIMARY KEY NOT NULL,
  `active_pack_id` text NOT NULL,
  `active_pack_version` text NOT NULL,
  `previous_pack_id` text,
  `previous_pack_version` text,
  `last_checked_at` integer,
  `last_updated_at` integer NOT NULL,
  `rollback_reason` text,
  `updated_at` integer NOT NULL
);
