/**
 * Every built-in `core.*` caller now goes through the per-caller quota check on each call, so the
 * manager must remember "this caller has no quota row" instead of reading the table every time —
 * without letting a lookup that raced a write cache what it read before that write.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../intelligence-test-harness'
import { IntelligenceQuotaManager } from '../intelligence-quota-manager'

interface QuotaRow {
  callerId: string
  callerType: string
  enabled: boolean
  requestsPerMinute: number | null
  requestsPerDay: number | null
  requestsPerMonth: number | null
  tokensPerMinute: number | null
  tokensPerDay: number | null
  tokensPerMonth: number | null
  costLimitPerDay: number | null
  costLimitPerMonth: number | null
}

/** Just enough of drizzle's chains for the quota table, with a gate on the next select. */
function createQuotaDb() {
  const rows: QuotaRow[] = []
  let gate: Promise<void> | null = null
  const reads = vi.fn()
  const select = () => {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: async () => {
        reads()
        const snapshot = [...rows]
        const pending = gate
        gate = null
        if (pending) await pending
        return snapshot
      }
    }
    return chain
  }
  return {
    rows,
    reads,
    /** The next select reads its rows now but resolves only when `release` is called. */
    holdNextSelect(): () => void {
      let release!: () => void
      gate = new Promise<void>((resolve) => {
        release = resolve
      })
      return release
    },
    db: {
      select,
      insert: () => ({
        values: async (value: Partial<QuotaRow>) => {
          rows.push({
            requestsPerMinute: null,
            requestsPerDay: null,
            requestsPerMonth: null,
            tokensPerMinute: null,
            tokensPerDay: null,
            tokensPerMonth: null,
            costLimitPerDay: null,
            costLimitPerMonth: null,
            enabled: true,
            ...value
          } as QuotaRow)
        }
      }),
      delete: () => ({
        where: async () => {
          rows.length = 0
        }
      })
    }
  }
}

function managerWith(fake: ReturnType<typeof createQuotaDb>): IntelligenceQuotaManager {
  const manager = new IntelligenceQuotaManager()
  ;(manager as unknown as { getDb: () => unknown }).getDb = () => fake.db
  return manager
}

describe('quota lookups for callers without a quota', () => {
  let fake: ReturnType<typeof createQuotaDb>

  beforeEach(() => {
    fake = createQuotaDb()
  })

  it('reads the table once, then serves "no quota" from the cache', async () => {
    const manager = managerWith(fake)

    for (let index = 0; index < 5; index += 1) {
      await expect(manager.checkQuota('core.files.embedding', 'plugin')).resolves.toEqual({
        allowed: true
      })
    }
    expect(fake.reads).toHaveBeenCalledTimes(1)
  })

  it('picks up a quota set later instead of the cached absence', async () => {
    const manager = managerWith(fake)
    await expect(manager.getQuota('core.home.opening', 'plugin')).resolves.toBeNull()

    await manager.setQuota({
      callerId: 'core.home.opening',
      callerType: 'plugin',
      requestsPerDay: 3,
      enabled: true
    })

    await expect(manager.getQuota('core.home.opening', 'plugin')).resolves.toMatchObject({
      requestsPerDay: 3
    })
  })

  it('does not cache an absence it read before a concurrent setQuota landed', async () => {
    const manager = managerWith(fake)
    const release = fake.holdNextSelect()
    const racingRead = manager.getQuota('core.ocr.clipboard', 'plugin')

    await manager.setQuota({
      callerId: 'core.ocr.clipboard',
      callerType: 'plugin',
      requestsPerMinute: 1,
      enabled: true
    })
    release()

    // The racing read answers with what it saw, but must not overwrite the newer cache entry.
    await expect(racingRead).resolves.toBeNull()
    await expect(manager.getQuota('core.ocr.clipboard', 'plugin')).resolves.toMatchObject({
      requestsPerMinute: 1
    })
  })

  it('forgets a quota once it is deleted', async () => {
    const manager = managerWith(fake)
    await manager.setQuota({ callerId: 'plugin:a', callerType: 'plugin', enabled: true })
    await manager.deleteQuota('plugin:a', 'plugin')

    await expect(manager.getQuota('plugin:a', 'plugin')).resolves.toBeNull()
    expect(fake.reads).toHaveBeenCalled()
  })
})
