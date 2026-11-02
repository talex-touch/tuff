CREATE TABLE IF NOT EXISTS `ai_orchestrator_run_messages` (
  `run_id` text NOT NULL,
  `seq` integer NOT NULL,
  `envelope` text NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`run_id`, `seq`),
  FOREIGN KEY (`run_id`) REFERENCES `ai_orchestrator_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
