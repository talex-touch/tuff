CREATE TABLE `system_update_state` (
  `id` text PRIMARY KEY NOT NULL,
  `etag` text,
  `last_fetched_at` integer DEFAULT 0 NOT NULL,
  `last_processed_id` text,
  `updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_config` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fx_rates` (
  `base` text NOT NULL,
  `quote` text NOT NULL,
  `rate` real NOT NULL,
  `updated_at` integer NOT NULL,
  `source` text NOT NULL,
  `provider_updated_at` integer,
  `fetched_at` integer NOT NULL,
  PRIMARY KEY(`base`, `quote`)
);
--> statement-breakpoint
CREATE INDEX `idx_fx_rates_base` ON `fx_rates` (`base`);
--> statement-breakpoint
CREATE INDEX `idx_fx_rates_updated` ON `fx_rates` (`updated_at`);
