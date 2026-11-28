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
  '37 4 * * *': ['docs', 'privacy-deletions'],
}

export const MAINTENANCE_REQUEST_TIMEOUT_MS = 30_000
export const MAINTENANCE_MAX_RESPONSE_BYTES = 500

async function readBoundedResponseText(response: Response, maxBytes = MAINTENANCE_MAX_RESPONSE_BYTES): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    return (await response.text()).slice(0, maxBytes)
  }

  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done)
        break
      if (!value || value.byteLength === 0)
        continue
      const remaining = maxBytes - total
      if (value.byteLength <= remaining) {
        chunks.push(value)
        total += value.byteLength
      }
      else {
        chunks.push(value.subarray(0, remaining))
        total += remaining
        await reader.cancel().catch(() => {})
        break
      }
    }
  }
  finally {
    reader.releaseLock()
  }

  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(combined)
}

export async function runMaintenanceTasks(
  cron: string,
  env: Env,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = MAINTENANCE_REQUEST_TIMEOUT_MS,
): Promise<void> {
  const tasks = TASKS_BY_CRON[cron] ?? []
  const failures: string[] = []
  for (const task of tasks) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${env.NEXUS_ORIGIN}/api/internal/maintenance/${task}`, {
        method: 'POST',
        headers: { 'x-maintenance-secret': env.MAINTENANCE_SECRET },
        signal: controller.signal,
      })
      const body = await readBoundedResponseText(response, MAINTENANCE_MAX_RESPONSE_BYTES)
      if (response.ok)
        console.log(`[maintenance] ${task}: ${body}`)
      else
        failures.push(`${task}: HTTP ${response.status} ${body}`)
    }
    catch (error) {
      const reason = error instanceof Error && error.name === 'AbortError'
        ? `timeout after ${timeoutMs}ms`
        : (error instanceof Error ? error.message : String(error))
      failures.push(`${task}: ${reason}`)
    }
    finally {
      clearTimeout(timer)
    }
  }
  if (failures.length)
    throw new Error(`[maintenance] failed: ${failures.join('; ')}`)
}

export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await runMaintenanceTasks(event.cron, env)
  },
}
