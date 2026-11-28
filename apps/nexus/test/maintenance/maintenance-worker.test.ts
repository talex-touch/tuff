import { describe, expect, it, vi } from 'vitest'
import { MAINTENANCE_MAX_RESPONSE_BYTES, runMaintenanceTasks, TASKS_BY_CRON } from '../../maintenance-worker/src/index'

/** The scheduled maintenance Worker: which task each cron calls, and how a failure surfaces. */

const env = { NEXUS_ORIGIN: 'https://nexus.example', MAINTENANCE_SECRET: 'shared-secret' }

describe('maintenance worker', () => {
  it('calls each cron\'s task on the Nexus origin with the shared secret and an abort signal', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))

    await runMaintenanceTasks('*/5 * * * *', env, fetchImpl as unknown as typeof fetch)

    expect(fetchImpl).toHaveBeenCalledWith('https://nexus.example/api/internal/maintenance/asr', {
      method: 'POST',
      headers: { 'x-maintenance-secret': 'shared-secret' },
      signal: expect.any(AbortSignal),
    })
  })

  it('has a task for every cron it is scheduled on', () => {
    expect(Object.values(TASKS_BY_CRON).flat().sort()).toEqual(['asr', 'docs', 'privacy-deletions', 'retention'])
  })

  it('fails the scheduled event when a task fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('Not Found', { status: 404 }))

    await expect(runMaintenanceTasks('37 4 * * *', env, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/docs: HTTP 404/)
  })

  it('aborts hung requests after the configured timeout', async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        reject(err)
      })
    }))

    await expect(runMaintenanceTasks('*/5 * * * *', env, fetchImpl as unknown as typeof fetch, 15)).rejects.toThrow(/asr: timeout after 15ms/)
  })

  it('bounds response body reads without buffering an unbounded stream', async () => {
    let chunksPulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksPulled += 1
        controller.enqueue(new Uint8Array(256).fill(65))
      },
    })
    const fetchImpl = vi.fn(async () => new Response(stream, { status: 500 }))

    await expect(runMaintenanceTasks('*/5 * * * *', env, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      new RegExp(`asr: HTTP 500 A{${MAINTENANCE_MAX_RESPONSE_BYTES}}$`),
    )
    expect(chunksPulled).toBeLessThanOrEqual(3)
  })
})
