import { runTelemetryRetentionForDatabase } from '../../../apps/nexus/server/utils/telemetryRetentionCore'

export interface NexusMaintenanceEnv {
  DB: D1Database
}

const RETENTION_OPTIONS = {
  telemetryRetentionDays: 7,
  governanceRetentionDays: 14,
  batchLimit: 10000,
  dryRun: false,
} as const

export default {
  async scheduled(controller: ScheduledController, env: NexusMaintenanceEnv, ctx: ExecutionContext) {
    ctx.waitUntil(runMaintenance(controller, env))
  },
} satisfies ExportedHandler<NexusMaintenanceEnv>

async function runMaintenance(controller: ScheduledController, env: NexusMaintenanceEnv) {
  const result = await runTelemetryRetentionForDatabase(env.DB, RETENTION_OPTIONS)
  console.warn('[nexus-maintenance] retention completed', {
    cron: controller.cron,
    scheduledTime: controller.scheduledTime,
    result,
  })
}
