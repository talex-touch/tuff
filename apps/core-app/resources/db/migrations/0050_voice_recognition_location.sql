ALTER TABLE `voice_recognition_records` ADD `recognition_location` text;
--> statement-breakpoint
UPDATE `voice_recognition_records`
SET `recognition_location` = 'on-device'
WHERE `recognition_location` IS NULL
  AND `provider_id` IN ('local-offline', 'tuff-local-asr');
--> statement-breakpoint
UPDATE `voice_recognition_records`
SET `recognition_location` = 'cloud'
WHERE `recognition_location` IS NULL
  AND `provider_id` IS NOT NULL;
