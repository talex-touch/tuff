import { describe, expect, it, vi } from 'vitest'
import { runMaintenanceTasks, TASKS_BY_CRON } from '../../maintenance-worker/src/index'

/** The scheduled maintenance Worker: which task each cron calls, and how a failure surfaces. */

const env = { NEXUS_ORIGIN: 'https://nexus.example', MAINTENANCE_SECRET: 'shared-secret' }

describe('maintenance worker', () => {
  it('calls each cron\'s task on the Nexus origin with the shared secret', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))

    await runMaintenanceTasks('*/5 * * * *', env, fetchImpl as unknown as typeof fetch)

    expect(fetchImpl).toHaveBeenCalledWith('https://nexus.example/api/internal/maintenance/asr', {
      method: 'POST',
      headers: { 'x-maintenance-secret': 'shared-secret' },
    })
  })

  it('has a task for every cron it is scheduled on', () => {
    expect(Object.values(TASKS_BY_CRON).flat().sort()).toEqual(['asr', 'docs', 'retention'])
  })

  it('fails the scheduled event when a task fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('Not Found', { status: 404 }))

    await expect(runMaintenanceTasks('37 4 * * *', env, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/docs: HTTP 404/)
  })
})
