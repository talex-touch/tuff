import { describe, expect, it, vi } from 'vitest'
import {
  LEGACY_SOURCE_TYPE_TO_ID,
  planItemTimeStatsMigration,
  planUsageTrendMigration,
  resolveMigratedSourceId,
  UsageSourceIdentityMigration,
  USAGE_SOURCE_IDENTITY_MIGRATION_VERSION,
  type ItemTimeStatsRow,
  type UsageSourceIdentityMigrationDeps,
  type UsageTrendRow
} from './usage-source-identity-migration'

function distributions(
  hour: number,
  dayOfWeek: number,
  morning: number
): Omit<ItemTimeStatsRow, 'sourceId' | 'itemId'> {
  return {
    hourDistribution: JSON.stringify(
      Array.from({ length: 24 }, (_, index) => (index === 9 ? hour : 0))
    ),
    dayOfWeekDistribution: JSON.stringify(
      Array.from({ length: 7 }, (_, index) => (index === 1 ? dayOfWeek : 0))
    ),
    timeSlotDistribution: JSON.stringify({ morning, afternoon: 0, evening: 0, night: 0 })
  }
}

function key(row: { sourceId: string; itemId: string; day: number }): string {
  return `${row.sourceId} ${row.itemId} ${row.day}`
}

function createDeps(
  overrides: Partial<UsageSourceIdentityMigrationDeps> = {}
): UsageSourceIdentityMigrationDeps {
  return {
    getAppliedVersion: vi.fn(async () => null),
    setAppliedVersion: vi.fn(async () => undefined),
    rewriteUsageLogSource: vi.fn(async () => undefined),
    loadLegacyTrendRows: vi.fn(async () => []),
    loadTrendRowsByKeys: vi.fn(async () => []),
    applyTrendMigration: vi.fn(async () => undefined),
    loadLegacyTimeStatsRows: vi.fn(async () => []),
    loadTimeStatsRowsByKeys: vi.fn(async () => []),
    applyTimeStatsMigration: vi.fn(async () => undefined),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    ...overrides
  }
}

describe('usage source identity migration map', () => {
  it('covers every source type the providers write', () => {
    expect(LEGACY_SOURCE_TYPE_TO_ID).toMatchObject({
      application: 'app-provider',
      app: 'app-provider',
      file: 'file-provider',
      history: 'clipboard-history',
      clipboard: 'clipboard-history',
      plugin: 'plugin-features'
    })
  })

  it('passes unknown source values through untouched', () => {
    // 'system' is the synthetic search-session log row, not a stand-in for an id.
    expect(resolveMigratedSourceId('system')).toBeNull()
    expect(resolveMigratedSourceId('app-provider')).toBeNull()
    expect(resolveMigratedSourceId('plugin-recommend:demo')).toBeNull()
  })
})

describe('planUsageTrendMigration', () => {
  it('re-keys a legacy row that has no id-keyed twin', () => {
    const legacyRows: UsageTrendRow[] = [
      { sourceId: 'application', itemId: '/Applications/Demo.app', day: 20_000, executeCount: 4 }
    ]

    const plan = planUsageTrendMigration({ legacyRows, existingRows: [] })

    expect(plan.merges).toEqual([])
    expect(plan.rewrites).toEqual([{ from: legacyRows[0], toSourceId: 'app-provider' }])
  })

  it('sums colliding rows into the id-keyed row and drops the legacy one', () => {
    const legacy: UsageTrendRow = {
      sourceId: 'application',
      itemId: '/Applications/Demo.app',
      day: 20_000,
      executeCount: 4
    }

    const plan = planUsageTrendMigration({
      legacyRows: [legacy],
      existingRows: [
        {
          sourceId: 'app-provider',
          itemId: '/Applications/Demo.app',
          day: 20_000,
          executeCount: 6
        }
      ]
    })

    expect(plan.rewrites).toEqual([])
    expect(plan.merges).toEqual([
      {
        from: legacy,
        into: { sourceId: 'app-provider', itemId: '/Applications/Demo.app', day: 20_000 },
        executeCount: 10
      }
    ])
  })

  it('folds two legacy values mapping to one id into a single total', () => {
    const plan = planUsageTrendMigration({
      legacyRows: [
        { sourceId: 'application', itemId: 'demo', day: 20_000, executeCount: 4 },
        { sourceId: 'app', itemId: 'demo', day: 20_000, executeCount: 3 }
      ],
      existingRows: []
    })

    // First legacy row re-keys in place, the second merges into what it became.
    expect(plan.rewrites).toHaveLength(1)
    expect(plan.merges).toHaveLength(1)
    expect(plan.merges[0]?.executeCount).toBe(7)
  })

  it('leaves rows under an unmapped source alone', () => {
    const plan = planUsageTrendMigration({
      legacyRows: [{ sourceId: 'system', itemId: 'search_session', day: 20_000, executeCount: 9 }],
      existingRows: []
    })

    expect(plan).toEqual({ rewrites: [], merges: [] })
  })

  it('adds up to the original totals when applied rewrites-then-merges', () => {
    const rows: UsageTrendRow[] = [
      { sourceId: 'application', itemId: 'demo', day: 20_000, executeCount: 4 },
      { sourceId: 'app', itemId: 'demo', day: 20_000, executeCount: 3 },
      { sourceId: 'app-provider', itemId: 'demo', day: 20_001, executeCount: 6 },
      { sourceId: 'application', itemId: 'demo', day: 20_001, executeCount: 5 }
    ]
    const legacyRows = rows.filter((row) => resolveMigratedSourceId(row.sourceId))
    const plan = planUsageTrendMigration({
      legacyRows,
      existingRows: rows.filter((row) => !resolveMigratedSourceId(row.sourceId))
    })

    // Reference writer: the order the DB writer must use.
    const table = new Map(rows.map((row) => [key(row), { ...row }]))
    for (const rewrite of plan.rewrites) {
      const row = table.get(key(rewrite.from))!
      table.delete(key(rewrite.from))
      row.sourceId = rewrite.toSourceId
      table.set(key(row), row)
    }
    for (const merge of plan.merges) {
      table.get(key(merge.into))!.executeCount = merge.executeCount
      table.delete(key(merge.from))
    }

    expect([...table.values()]).toEqual([
      { sourceId: 'app-provider', itemId: 'demo', day: 20_001, executeCount: 11 },
      { sourceId: 'app-provider', itemId: 'demo', day: 20_000, executeCount: 7 }
    ])
  })

  it('loses counts if a writer applies the merges before the rewrites', () => {
    // Negative control for the apply-order contract: the merge targets the row
    // the rewrite creates, so a writer that runs merges first updates nothing
    // and then deletes the legacy row it was supposed to fold in.
    const rows: UsageTrendRow[] = [
      { sourceId: 'application', itemId: 'demo', day: 20_000, executeCount: 4 },
      { sourceId: 'app', itemId: 'demo', day: 20_000, executeCount: 3 }
    ]
    const plan = planUsageTrendMigration({ legacyRows: rows, existingRows: [] })

    const table = new Map(rows.map((row) => [key(row), { ...row }]))
    for (const merge of plan.merges) {
      const target = table.get(key(merge.into))
      if (target) target.executeCount = merge.executeCount
      table.delete(key(merge.from))
    }
    for (const rewrite of plan.rewrites) {
      const row = table.get(key(rewrite.from))!
      table.delete(key(rewrite.from))
      row.sourceId = rewrite.toSourceId
      table.set(key(row), row)
    }

    expect([...table.values()]).toEqual([
      { sourceId: 'app-provider', itemId: 'demo', day: 20_000, executeCount: 4 }
    ])
  })
})

describe('planItemTimeStatsMigration', () => {
  it('re-keys a legacy row with no twin', () => {
    const plan = planItemTimeStatsMigration({
      legacyRows: [{ sourceId: 'history', itemId: '12', ...distributions(2, 2, 2) }],
      existingRows: []
    })

    expect(plan.merges).toEqual([])
    expect(plan.rewrites).toEqual([
      { from: { sourceId: 'history', itemId: '12' }, toSourceId: 'clipboard-history' }
    ])
  })

  it('sums each distribution bucket when the id-keyed row already exists', () => {
    const plan = planItemTimeStatsMigration({
      legacyRows: [{ sourceId: 'plugin', itemId: 'demo/feature', ...distributions(2, 2, 2) }],
      existingRows: [
        { sourceId: 'plugin-features', itemId: 'demo/feature', ...distributions(5, 5, 5) }
      ]
    })

    expect(plan.rewrites).toEqual([])
    expect(plan.merges).toHaveLength(1)
    const merged = plan.merges[0]!
    expect(merged.into).toEqual({ sourceId: 'plugin-features', itemId: 'demo/feature' })
    expect(JSON.parse(merged.hourDistribution)[9]).toBe(7)
    expect(JSON.parse(merged.dayOfWeekDistribution)[1]).toBe(7)
    expect(JSON.parse(merged.timeSlotDistribution)).toEqual({
      morning: 7,
      afternoon: 0,
      evening: 0,
      night: 0
    })
  })

  it('treats unparsable stored distributions as empty instead of failing', () => {
    const plan = planItemTimeStatsMigration({
      legacyRows: [
        {
          sourceId: 'application',
          itemId: 'demo',
          hourDistribution: 'not json',
          dayOfWeekDistribution: '{}',
          timeSlotDistribution: 'null'
        }
      ],
      existingRows: [{ sourceId: 'app-provider', itemId: 'demo', ...distributions(5, 5, 5) }]
    })

    const merged = plan.merges[0]!
    expect(JSON.parse(merged.hourDistribution)[9]).toBe(5)
    expect(JSON.parse(merged.timeSlotDistribution).morning).toBe(5)
  })
})

describe('UsageSourceIdentityMigration', () => {
  it('re-keys logs before the tables that are derived from them', async () => {
    const calls: string[] = []
    const deps = createDeps({
      rewriteUsageLogSource: vi.fn(async (from: string) => {
        calls.push(`log:${from}`)
      }),
      loadLegacyTrendRows: vi.fn(async () => {
        calls.push('trend')
        return []
      }),
      loadLegacyTimeStatsRows: vi.fn(async () => {
        calls.push('time-stats')
        return []
      })
    })

    const result = await new UsageSourceIdentityMigration(deps).run()

    expect(result.status).toBe('completed')
    expect(result.logSourcesRewritten).toBe(Object.keys(LEGACY_SOURCE_TYPE_TO_ID).length)
    expect(calls.slice(-2)).toEqual(['trend', 'time-stats'])
    expect(calls.indexOf('trend')).toBeGreaterThan(calls.indexOf('log:application'))
    expect(deps.setAppliedVersion).toHaveBeenCalledWith(USAGE_SOURCE_IDENTITY_MIGRATION_VERSION)
  })

  it('does nothing on a second run', async () => {
    const deps = createDeps({
      getAppliedVersion: vi.fn(async () => USAGE_SOURCE_IDENTITY_MIGRATION_VERSION)
    })

    const result = await new UsageSourceIdentityMigration(deps).run()

    expect(result).toMatchObject({ status: 'skipped', reason: 'already-applied' })
    expect(deps.rewriteUsageLogSource).not.toHaveBeenCalled()
    expect(deps.applyTrendMigration).not.toHaveBeenCalled()
    expect(deps.setAppliedVersion).not.toHaveBeenCalled()
  })

  it('plans nothing when every row is already id-keyed', async () => {
    const deps = createDeps()

    await new UsageSourceIdentityMigration(deps).run()

    expect(deps.applyTrendMigration).not.toHaveBeenCalled()
    expect(deps.applyTimeStatsMigration).not.toHaveBeenCalled()
    expect(deps.setAppliedVersion).toHaveBeenCalledTimes(1)
  })

  it('leaves the version unrecorded when a step fails so the next boot retries', async () => {
    const deps = createDeps({
      loadLegacyTrendRows: vi.fn(async () => {
        throw new Error('db unavailable')
      })
    })

    const result = await new UsageSourceIdentityMigration(deps).run()

    expect(result.failed).toBe(1)
    expect(deps.setAppliedVersion).not.toHaveBeenCalled()
    expect(deps.logWarn).toHaveBeenCalled()
  })
})
