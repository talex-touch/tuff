-- Remove rows that can only have been produced by the legacy source-type replay.
-- A provider-aware sibling must exist; provider ids are never inferred from usage_logs.source.
DELETE FROM `item_usage_stats`
WHERE `source_id` = `source_type`
  AND EXISTS (
    SELECT 1
    FROM `item_usage_stats` AS `provider_stats`
    WHERE `provider_stats`.`item_id` = `item_usage_stats`.`item_id`
      AND `provider_stats`.`source_type` = `item_usage_stats`.`source_type`
      AND `provider_stats`.`source_id` <> `item_usage_stats`.`source_id`
  );
--> statement-breakpoint
-- usage_summary increments before the real-time queue, so it is a safe upper bound.
-- Only proven over-counts are lowered; under-counts and unrelated fields stay unchanged.
UPDATE `item_usage_stats`
SET `execute_count` = (
  SELECT `summary`.`click_count`
  FROM `usage_summary` AS `summary`
  WHERE `summary`.`item_id` = `item_usage_stats`.`item_id`
)
WHERE EXISTS (
  SELECT 1
  FROM `usage_summary` AS `summary`
  WHERE `summary`.`item_id` = `item_usage_stats`.`item_id`
    AND `item_usage_stats`.`execute_count` > `summary`.`click_count`
);
