CREATE TABLE IF NOT EXISTS `recommendation_exposure_daily` (
  `day` integer NOT NULL,
  `surface` text NOT NULL,
  `k` integer NOT NULL,
  `impressions` integer DEFAULT 0 NOT NULL,
  `clicks` integer DEFAULT 0 NOT NULL,
  `updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
  PRIMARY KEY (`day`, `surface`, `k`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recommendation_exposure_daily_day` ON `recommendation_exposure_daily` (`day`);
