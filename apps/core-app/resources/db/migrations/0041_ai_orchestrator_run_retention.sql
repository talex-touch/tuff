DROP INDEX IF EXISTS `idx_ai_orchestrator_runs_retention`;
--> statement-breakpoint
CREATE INDEX `idx_ai_orchestrator_runs_retention`
ON `ai_orchestrator_runs` (`updated_at`, `id`)
WHERE `status` IN ('completed', 'failed', 'cancelled', 'interrupted');
