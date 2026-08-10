/**
 * checkQuota compared the configured limits against a usage snapshot that is (a) built from
 * intelligence_audit_logs, so it only reflects requests already flushed, and (b) cached for 10
 * seconds with nothing invalidating it - clearCache had no production caller. A caller with
 * requestsPerMinute: 10 could fire hundreds of calls in two seconds and every one would read the
 * same stale zero (#778).
 *
 * These drive the real checkQuota with the database pinned at zero usage, which is exactly the
 * state that used to admit an unbounded burst.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'

import { IntelligenceQuotaManager } from './intelligence-quota-manager'

interface QuotaInternals {
  getDb: () => unknown
  getQuota: (callerId: string, callerType?: string) => Promise<unknown>
  checkQuota: (
    callerId: string,
    callerType?: 'plugin' | 'user' | 'system',
    estimatedTokens?: number
  ) => Promise<{ allowed: boolean; reason?: string }>
  clearCache: () => void
}

/** A database that always reports zero usage - the pre-flush state during a burst. */
function zeroUsageDb(): unknown {
  const rows: unknown[] = []
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
    then: (resolve: (value: unknown[]) => unknown) => resolve(rows)
  }
  return { select: () => chain }
}

function createManager(requestsPerMinute: number | undefined): QuotaInternals {
  const manager = new IntelligenceQuotaManager() as unknown as QuotaInternals
  manager.getDb = () => zeroUsageDb()
  manager.getQuota = async () => ({
    callerId: 'plugin-a',
    callerType: 'plugin',
    enabled: true,
    requestsPerMinute
  })
  return manager
}

describe('quota binds during a burst the database has not caught up with', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'))
  })

  it('每分钟 3 次的限额:第 4 次被拒,而不是全部放行', async () => {
    const manager = createManager(3)

    const verdicts: boolean[] = []
    for (let index = 0; index < 5; index += 1) {
      verdicts.push((await manager.checkQuota('plugin-a', 'plugin')).allowed)
    }

    expect(verdicts).toEqual([true, true, true, false, false])
  })

  it('拒绝理由是每分钟速率限制', async () => {
    const manager = createManager(1)

    await manager.checkQuota('plugin-a', 'plugin')
    const second = await manager.checkQuota('plugin-a', 'plugin')

    expect(second.allowed).toBe(false)
    expect(second.reason).toMatch(/requests per minute/i)
  })

  it('一分钟窗口滑过之后重新放行(不是永久拒绝)', async () => {
    const manager = createManager(2)

    expect((await manager.checkQuota('plugin-a', 'plugin')).allowed).toBe(true)
    expect((await manager.checkQuota('plugin-a', 'plugin')).allowed).toBe(true)
    expect((await manager.checkQuota('plugin-a', 'plugin')).allowed).toBe(false)

    vi.setSystemTime(new Date('2026-02-01T00:01:01.000Z'))

    expect((await manager.checkQuota('plugin-a', 'plugin')).allowed).toBe(true)
  })

  it('没有配置每分钟限额时不受影响', async () => {
    const manager = createManager(undefined)

    for (let index = 0; index < 20; index += 1) {
      expect((await manager.checkQuota('plugin-a', 'plugin')).allowed).toBe(true)
    }
  })
})
