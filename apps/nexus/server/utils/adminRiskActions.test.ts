import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeRiskActorUnblock } from './adminRiskActions'
import { upsertIpBan } from './intelligenceStore'

/**
 * Unblocking actors: every actor's two writes go out together instead of one round trip after another,
 * and a failure is reported after every actor was attempted.
 */

const calls = vi.hoisted(() => ({
  started: [] as string[],
  releases: [] as Array<() => void>,
  failUpsertFor: null as string | null,
}))

function held(label: string) {
  calls.started.push(label)
  return new Promise<void>((resolve) => {
    calls.releases.push(resolve)
  })
}

vi.mock('./ipSecurityStore', () => ({
  unblockIp: vi.fn(async (_event: unknown, ip: string) => {
    await held(`unblock:${ip}`)
    return ip !== 'unknown'
  }),
}))

vi.mock('./intelligenceStore', () => ({
  upsertIpBan: vi.fn(async (_event: unknown, data: { ip: string }) => {
    await held(`ban:${data.ip}`)
    if (data.ip === calls.failUpsertFor)
      throw new Error(`ban write failed for ${data.ip}`)
    return { id: `ipb_${data.ip}`, ip: data.ip }
  }),
  deleteIpBan: vi.fn(),
  setIpBanEnabled: vi.fn(),
}))

vi.mock('./defenseModeController', () => ({ overrideDefenseMode: vi.fn() }))

async function releaseAll() {
  for (let round = 0; round < 5; round += 1) {
    await Promise.resolve()
    calls.releases.splice(0).forEach(release => release())
  }
  for (let round = 0; round < 5; round += 1)
    await Promise.resolve()
}

beforeEach(() => {
  calls.started.length = 0
  calls.releases.length = 0
  calls.failUpsertFor = null
  vi.mocked(upsertIpBan).mockClear()
})

describe('executeRiskActorUnblock', () => {
  it('sends every actor\'s writes at once', async () => {
    const result = executeRiskActorUnblock({} as any, { actors: ['1.1.1.1', '2.2.2.2', 'unknown'], reason: 'appeal' })
    await Promise.resolve()

    // Nothing has answered yet, and all six writes are already on their way.
    expect(calls.started.sort()).toEqual([
      'ban:1.1.1.1', 'ban:2.2.2.2', 'ban:unknown',
      'unblock:1.1.1.1', 'unblock:2.2.2.2', 'unblock:unknown',
    ])

    await releaseAll()
    await expect(result).resolves.toEqual({
      total: 3,
      success: true,
      successCount: 2,
      results: [
        { actor: '1.1.1.1', success: true },
        { actor: '2.2.2.2', success: true },
        { actor: 'unknown', success: false },
      ],
    })
    expect(upsertIpBan).toHaveBeenCalledWith({}, { ip: '1.1.1.1', enabled: false, reason: 'appeal' })
  })

  it('attempts every actor before reporting a failed write', async () => {
    calls.failUpsertFor = '1.1.1.1'
    const result = executeRiskActorUnblock({} as any, { actors: ['1.1.1.1', '2.2.2.2'] })
    const settled = result.catch(error => error)
    await releaseAll()

    await expect(settled).resolves.toMatchObject({ message: 'ban write failed for 1.1.1.1' })
    expect(upsertIpBan).toHaveBeenCalledTimes(2)
  })

  it('refuses an empty list', async () => {
    await expect(executeRiskActorUnblock({} as any, { actors: [' '] })).rejects.toMatchObject({ statusCode: 400 })
  })
})
