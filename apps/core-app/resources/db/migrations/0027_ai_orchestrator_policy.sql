ALTER TABLE `ai_import_items` ADD `candidate_id` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `ai_import_items` SET `candidate_id` = `id` WHERE `candidate_id` = '';
--> statement-breakpoint
ALTER TABLE `ai_import_items` ADD `target_scope` text NOT NULL DEFAULT 'global';
--> statement-breakpoint
UPDATE `ai_import_items` SET `target_scope` = CASE WHEN `scope` = 'project' THEN 'workspace' ELSE 'global' END;
--> statement-breakpoint
ALTER TABLE `ai_import_items` ADD `workspace_root` text;
--> statement-breakpoint
ALTER TABLE `ai_import_items` ADD `alias` text;
--> statement-breakpoint
ALTER TABLE `ai_import_items` ADD `source_key` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `ai_import_items` SET `source_key` = `path` WHERE `source_key` = '';
--> statement-breakpoint
ALTER TABLE `ai_import_items` ADD `content_ref` text;
--> statement-breakpoint
ALTER TABLE `ai_import_items` ADD `projection` text;
--> statement-breakpoint
ALTER TABLE `ai_import_items` ADD `secrets` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `ai_import_items` ADD `state` text NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE `ai_import_items` ADD `current` integer NOT NULL DEFAULT true;
--> statement-breakpoint
UPDATE `ai_import_items` AS `item`
SET `current` = CASE WHEN `item`.`id` = (
  SELECT `newer`.`id`
  FROM `ai_import_items` AS `newer`
  WHERE `newer`.`candidate_id` = `item`.`candidate_id`
  ORDER BY `newer`.`updated_at` DESC, `newer`.`created_at` DESC, `newer`.`id` DESC
  LIMIT 1
) THEN true ELSE false END;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_ai_import_items_current_alias`
ON `ai_import_items` (`target_scope`, COALESCE(`workspace_root`, ''), `kind`, `alias`)
WHERE `current` = true AND `alias` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `ai_orchestrator_runs` ADD `approval_reason` text;
--> statement-breakpoint
ALTER TABLE `ai_orchestrator_runs` ADD `delegation_plan` text;
--> statement-breakpoint
ALTER TABLE `ai_orchestrator_runs` ADD `parent_run_id` text;
--> statement-breakpoint
ALTER TABLE `ai_automations` ADD `policy` text NOT NULL DEFAULT '{"version":1,"allowedToolIds":[],"allowedMcpServerIds":[],"allowedAgentProfileIds":[],"allowedPaths":[],"allowedNetworkTargets":[],"budget":{"maxSteps":20,"maxToolCalls":20,"maxChildRuns":0,"maxConcurrency":1},"timeoutMs":300000,"maxRunsPerWindow":60,"windowMs":3600000}';

--> statement-breakpoint
ALTER TABLE `ai_automation_runs` ADD `policy_version` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `ai_automation_runs` ADD `approval_reason` text;
