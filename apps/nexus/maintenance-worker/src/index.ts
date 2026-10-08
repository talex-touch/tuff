/**
 * Calls the Nexus maintenance endpoint for each task due on this cron (see `wrangler.toml`).
 *
 * - every 5 minutes: `asr`, the ASR result cleanup. The endpoint holds that cleanup's lease for ten
 *   minutes, so traffic stops scheduling it while this runs and takes over again if it stops.
 * - every 6 hours: `retention`, which itself runs only when its lease is due.
 * - daily: `docs`, the engagement sessions past their retention.
 *
 * A failed task fails the scheduled event, which shows in the Worker's cron event log.
 */
interface Env {
  NEXUS_ORIGIN: string
  MAINTENANCE_SECRET: string
}

interface ScheduledEvent {
  cron: string
  scheduledTime: number
}

export const TASKS_BY_CRON: Record<string, readonly string[]> = {
  '*/5 * * * *': ['asr'],
  '11 */6 * * *': ['retention'],
  '37 4 * * *': ['docs'],
}

export async function runMaintenanceTasks(cron: string, env: Env, fetchImpl: typeof fetch = fetch): Promise<void> {
  const tasks = TASKS_BY_CRON[cron] ?? []
  const failures: string[] = []
  for (const task of tasks) {
    const response = await fetchImpl(`${env.NEXUS_ORIGIN}/api/internal/maintenance/${task}`, {
      method: 'POST',
      headers: { 'x-maintenance-secret': env.MAINTENANCE_SECRET },
    })
    const body = (await response.text()).slice(0, 500)
    if (response.ok)
      console.log(`[maintenance] ${task}: ${body}`)
    else
      failures.push(`${task}: HTTP ${response.status} ${body}`)
  }
  if (failures.length)
    throw new Error(`[maintenance] failed: ${failures.join('; ')}`)
}

export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await runMaintenanceTasks(event.cron, env)
  },
}
