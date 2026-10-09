import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { getPlatformGovernanceAnalytics, listPlatformGovernanceEvents } from './platformGovernanceStore'
import { setTelemetryDailyRollupEnabledForTest } from './telemetryDailyRollup'
import {
  buildTelemetryBatchReceiptStatement,
  commitTelemetryWrite,
  getAnalyticsSummary,
  getTelemetryBatchReceipt,
  prepareTelemetryWrite,
  recordTelemetryEvent,
  TelemetryWriteBatch,
} from './telemetryStore'

interface TelemetryRow {
  id: string
  event_type: string
  user_id: string | null
  client_id: string | null
  device_fingerprint: string | null
  platform: string | null
  version: string | null
  region: string | null
  search_query: string | null
  search_duration_ms: number | null
  search_result_count: number | null
  provider_timings: string | null
  input_types: string | null
  metadata: string | null
  is_anonymous: number
  created_at: string
}

interface DailyStatRow {
  date: string
  stat_type: string
  stat_key: string
  value: number
}

interface GovernanceEventRow {
  id: string
  scope: string
  action: string
  actor_hash: string | null
  context_hash: string | null
  resource_type: string | null
  resource_id: string | null
  channel: string | null
  unit: string
  quantity: number
  metadata_json: string | null
  occurred_at: string
  created_at: string
}

class MockStatement {
  private args: any[] = []

  constructor(
    private readonly db: MockD1Database,
    private readonly sql: string,
  ) {}

  bind(...args: any[]) {
    this.args = args
    return this
  }

  async run() {
    return this.db.run(this.sql, this.args)
  }

  async first<T = any>() {
    return this.db.first(this.sql, this.args) as T
  }

  async all<T = any>() {
    return { results: this.db.all(this.sql, this.args) as T[] }
  }
}

interface ReceiptRow {
  scope: string
  idempotency_key: string
  payload_hash: string
  response_json: string
  created_at: string
  expires_at: string
}

class MockD1Database {
  telemetryRows: TelemetryRow[] = []
  governanceRows: GovernanceEventRow[] = []
  dailyStats = new Map<string, DailyStatRow>()
  receiptRows: ReceiptRow[] = []
  quarantineRows = 0
  /** Every `batch()` call's statement count, in order (schema DDL batches included). */
  batchSizes: number[] = []
  /** Statements run outside any batch, by SQL; the commit path must leave this at zero. */
  standaloneRuns: string[] = []
  /** Makes `run` throw for a matching statement, to prove a batch is all-or-nothing. */
  failOn: ((sql: string) => boolean) | null = null
  private inBatch = false

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  /**
   * D1 semantics: the statements run in order inside one transaction, so a failure anywhere
   * leaves nothing of the batch behind.
   */
  async batch(statements: MockStatement[]) {
    this.batchSizes.push(statements.length)
    const snapshot = {
      telemetryRows: [...this.telemetryRows],
      governanceRows: [...this.governanceRows],
      dailyStats: new Map([...this.dailyStats].map(([key, row]) => [key, { ...row }])),
      receiptRows: [...this.receiptRows],
      quarantineRows: this.quarantineRows,
    }
    this.inBatch = true
    const results: unknown[] = []
    try {
      for (const statement of statements) results.push(await statement.run())
    }
    catch (error) {
      this.telemetryRows = snapshot.telemetryRows
      this.governanceRows = snapshot.governanceRows
      this.dailyStats = snapshot.dailyStats
      this.receiptRows = snapshot.receiptRows
      this.quarantineRows = snapshot.quarantineRows
      throw error
    }
    finally {
      this.inBatch = false
    }
    return results
  }

  run(sql: string, args: any[]) {
    if (this.failOn?.(sql)) {
      throw new Error(`D1 statement failed: ${sql.trim().slice(0, 40)}`)
    }
    // Governance rows and the schema DDL are allowed outside a batch; telemetry rows, counters
    // and receipts are not.
    if (!this.inBatch && /INSERT INTO (telemetry_events|daily_stats|telemetry_batch_receipts)/.test(sql)) {
      this.standaloneRuns.push(sql.trim().slice(0, 60))
    }
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX') || sql.includes('ALTER TABLE')) {
      return { meta: { changes: 0 } }
    }

    if (sql.includes('INSERT INTO telemetry_batch_receipts')) {
      const [scope, idempotencyKey, payloadHash, responseJson, createdAt, expiresAt] = args
      if (!this.receiptRows.some(row => row.scope === scope && row.idempotency_key === idempotencyKey)) {
        this.receiptRows.push({
          scope: String(scope),
          idempotency_key: String(idempotencyKey),
          payload_hash: String(payloadHash),
          response_json: String(responseJson),
          created_at: String(createdAt),
          expires_at: String(expiresAt),
        })
      }
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO telemetry_events_quarantine')) {
      this.quarantineRows += 1
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO telemetry_events')) {
      const [
        id,
        eventType,
        userId,
        clientId,
        deviceFingerprint,
        platform,
        version,
        region,
        _countryCode,
        _regionCode,
        _regionName,
        _city,
        _latitude,
        _longitude,
        _timezone,
        _geoSource,
        _ip,
        searchQuery,
        searchDurationMs,
        searchResultCount,
        providerTimings,
        inputTypes,
        metadata,
        isAnonymous,
        createdAt,
      ] = args
      this.telemetryRows.push({
        id: String(id),
        event_type: String(eventType),
        user_id: userId == null ? null : String(userId),
        client_id: clientId == null ? null : String(clientId),
        device_fingerprint: deviceFingerprint == null ? null : String(deviceFingerprint),
        platform: platform == null ? null : String(platform),
        version: version == null ? null : String(version),
        region: region == null ? null : String(region),
        search_query: searchQuery == null ? null : String(searchQuery),
        search_duration_ms: searchDurationMs == null ? null : Number(searchDurationMs),
        search_result_count: searchResultCount == null ? null : Number(searchResultCount),
        provider_timings: providerTimings == null ? null : String(providerTimings),
        input_types: inputTypes == null ? null : String(inputTypes),
        metadata: metadata == null ? null : String(metadata),
        is_anonymous: Number(isAnonymous),
        created_at: String(createdAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO platform_governance_events')) {
      const [
        id,
        scope,
        action,
        actorHash,
        contextHash,
        resourceType,
        resourceId,
        channel,
        unit,
        quantity,
        metadataJson,
        occurredAt,
        createdAt,
      ] = args
      this.governanceRows.push({
        id: String(id),
        scope: String(scope),
        action: String(action),
        actor_hash: actorHash == null ? null : String(actorHash),
        context_hash: contextHash == null ? null : String(contextHash),
        resource_type: resourceType == null ? null : String(resourceType),
        resource_id: resourceId == null ? null : String(resourceId),
        channel: channel == null ? null : String(channel),
        unit: String(unit),
        quantity: Number(quantity),
        metadata_json: metadataJson == null ? null : String(metadataJson),
        occurred_at: String(occurredAt),
        created_at: String(createdAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO daily_stats')) {
      const [date, statType, statKey, value] = args
      const key = `${date}:${statType}:${statKey}`
      const current = this.dailyStats.get(key)
      let nextValue = Number(value)
      if (current) {
        if (sql.includes('value = value + ?4')) {
          nextValue = current.value + Number(value)
        }
        else if (sql.includes('value = MAX(value, ?4)')) {
          nextValue = Math.max(current.value, Number(value))
        }
        else if (sql.includes('value = MIN(value, ?4)')) {
          nextValue = Math.min(current.value, Number(value))
        }
      }
      this.dailyStats.set(key, {
        date: String(date),
        stat_type: String(statType),
        stat_key: String(statKey),
        value: nextValue,
      })
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('FROM telemetry_batch_receipts')) {
      const [scope, idempotencyKey] = args
      return this.receiptRows.find(row => row.scope === scope && row.idempotency_key === idempotencyKey) ?? null
    }
    return null
  }

  all(sql: string, args: any[]) {
    if (sql.includes('PRAGMA table_info')) {
      return [
        { name: 'ip' },
        { name: 'client_id' },
        { name: 'country_code' },
        { name: 'region_code' },
        { name: 'region_name' },
        { name: 'city' },
        { name: 'latitude' },
        { name: 'longitude' },
        { name: 'timezone' },
        { name: 'geo_source' },
      ]
    }

    if (sql.includes('FROM daily_stats')) {
      const startDate = String(args[0])
      return [...this.dailyStats.values()].filter(row => row.date >= startDate)
    }

    if (sql.includes('SELECT provider_timings') && sql.includes('FROM telemetry_events')) {
      const startTime = String(args[0])
      return this.telemetryRows
        .filter(row => row.event_type === 'search' && row.created_at >= startTime && row.provider_timings)
        .map(row => ({ provider_timings: row.provider_timings }))
    }

    if (sql.includes('SELECT version') && sql.includes('FROM telemetry_events')) {
      return []
    }

    if (sql.includes('FROM platform_governance_events')) {
      return [...this.governanceRows]
    }

    return []
  }
}

const state = vi.hoisted(() => ({
  db: null as MockD1Database | SqliteD1Database | null,
  maintenanceSchedules: [] as Array<{ event: unknown, db: unknown }>,
  rollupSchedules: [] as Array<{ event: unknown, db: unknown }>,
}))

vi.mock('./cloudflare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cloudflare')>()),
  readCloudflareBindings: () => state.db ? { DB: state.db } : undefined,
  shouldUseCloudflareBindings: () => true,
}))

vi.mock('./ipSecurityStore', () => ({
  resolveRequestIp: () => '127.0.0.1',
}))

vi.mock('./telemetryRetentionMaintenance', () => ({
  scheduleTelemetryRetentionMaintenance: (event: unknown, db: unknown) => {
    state.maintenanceSchedules.push({ event, db })
  },
}))

vi.mock('./telemetryDailyRollup', async importOriginal => ({
  ...(await importOriginal<typeof import('./telemetryDailyRollup')>()),
  scheduleTelemetryDailyRollup: (event: unknown, db: unknown) => {
    state.rollupSchedules.push({ event, db })
  },
}))

vi.mock('./requestGeo', () => ({
  resolveRequestGeo: () => ({
    countryCode: 'US',
    regionCode: 'CA',
    regionName: 'California',
    city: 'San Francisco',
    latitude: 37.7,
    longitude: -122.4,
    timezone: 'America/Los_Angeles',
    source: 'test',
  }),
}))

function makeEvent() {
  return {
    context: {},
    node: {
      req: {
        headers: {},
      },
    },
  } as any
}

describe('telemetryStore search provider metrics', () => {
  beforeEach(() => {
    state.db = new MockD1Database()
    state.maintenanceSchedules = []
    state.rollupSchedules = []
  })

  afterEach(() => {
    setTelemetryDailyRollupEnabledForTest(false)
  })

  it('records anonymous provider metrics without search query text', async () => {
    // The summary derives today's search counters from the stored rows with SQL (JSON functions
    // included), so this one runs against real SQLite rather than the text-matching mock.
    const db = createSqliteD1()
    state.db = db
    setTelemetryDailyRollupEnabledForTest(true)
    await recordTelemetryEvent(makeEvent(), {
      eventType: 'search',
      clientId: 'client-a',
      platform: 'win32',
      version: '2.4.10',
      searchQuery: 'private query',
      searchDurationMs: 950,
      searchResultCount: 5,
      providerTimings: {
        'app-provider': 120,
        'everything-provider': 900,
      },
      inputTypes: ['text'],
      metadata: {
        queryLength: 12,
        hasFilters: true,
        firstResultMs: 180,
        totalDurationMs: 950,
        firstResultCount: 3,
        providerErrorCount: 0,
        providerTimeoutCount: 1,
        filterKinds: ['plugin'],
        filterSources: ['corebox'],
        sortingDuration: 15,
        searchScene: 'text',
        providerResults: {
          'app-provider': 3,
          'everything-provider': 2,
        },
        resultCategories: {
          plugin: 4,
          command: 1,
        },
        providerStatus: {
          'app-provider': 'success',
          'everything-provider': 'timeout',
        },
        contextAppCategory: 'developer_tools',
        contextSource: 'active-app',
        entryPoint: 'global-shortcut',
        triggerType: 'keyboard',
        userPreferenceMode: 'frequent-first',
        sessionBucket: 'weekday-morning',
        pluginIds: ['touch-snippets'],
        pluginCategories: ['productivity'],
        contextTags: ['editor'],
        localHour: 9,
        localDayOfWeek: 2,
        selected: true,
        selectedProvider: 'everything-provider',
        selectedCategory: 'plugin',
        selectedPluginId: 'touch-snippets',
        selectedRank: 2,
        query: 'must not be stored',
      },
      isAnonymous: true,
    })

    const row = db.sqlite.prepare('SELECT search_query, metadata FROM telemetry_events').get() as Pick<TelemetryRow, 'search_query' | 'metadata'>
    expect(row.search_query).toBeNull()
    expect(row.metadata).not.toContain('private query')

    const summary = await getAnalyticsSummary(makeEvent(), { days: 7 })
    expect(summary.totalSearches).toBe(1)
    expect(summary.searchSlowCount).toBe(1)
    expect(summary.avgFirstResultMs).toBe(180)
    expect(summary.providerMetrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: 'everything-provider',
        calls: 1,
        avgDuration: 900,
        p95Duration: 900,
        resultCount: 2,
        timeoutCount: 1,
        slowCount: 1,
        slowRate: 100,
      }),
      expect.objectContaining({
        provider: 'app-provider',
        calls: 1,
        avgDuration: 120,
        p95Duration: 120,
        resultCount: 3,
        timeoutCount: 0,
      }),
    ]))

    const governanceRows = await listPlatformGovernanceEvents(makeEvent(), {
      scope: 'app',
      action: 'search',
      resourceType: 'search',
      limit: 10,
    })
    expect(governanceRows).toHaveLength(1)
    expect(governanceRows[0]).toMatchObject({
      scope: 'app',
      action: 'search',
      resourceId: 'text',
      channel: 'all',
      unit: 'search',
      quantity: 1,
    })
    expect(governanceRows[0]?.actorHash).toMatch(/^[a-f0-9]{64}$/)
    expect(governanceRows[0]?.actorHash).not.toBe('client-a')
    expect(JSON.stringify(governanceRows[0])).not.toContain('private query')
    expect(governanceRows[0]?.metadata).toMatchObject({
      queryLength: 12,
      hasFilters: true,
      firstResultMs: 180,
      totalDurationMs: 950,
      searchResultCount: 5,
      firstResultCount: 3,
      providerErrorCount: 0,
      providerTimeoutCount: 1,
      filterKinds: ['plugin'],
      filterSources: ['corebox'],
      inputTypes: ['text'],
      providerTimings: {
        'app-provider': 120,
        'everything-provider': 900,
      },
      providerResults: {
        'app-provider': 3,
        'everything-provider': 2,
      },
      resultCategories: {
        plugin: 4,
        command: 1,
      },
      providerStatus: {
        'app-provider': 'success',
        'everything-provider': 'timeout',
      },
      contextAppCategory: 'developer_tools',
      contextSource: 'active-app',
      entryPoint: 'global-shortcut',
      triggerType: 'keyboard',
      userPreferenceMode: 'frequent-first',
      sessionBucket: 'weekday-morning',
      pluginIds: ['touch-snippets'],
      pluginCategories: ['productivity'],
      contextTags: ['editor'],
      localHour: 9,
      localDayOfWeek: 2,
      selected: true,
      selectedProvider: 'everything-provider',
      selectedCategory: 'plugin',
      selectedPluginId: 'touch-snippets',
      selectedRank: 2,
      countryCode: 'US',
      regionCode: 'CA',
      timezone: 'America/Los_Angeles',
    })
    expect(JSON.stringify(governanceRows[0])).not.toContain('must not be stored')

    const analytics = await getPlatformGovernanceAnalytics(makeEvent(), { days: 7, limit: 100, topLimit: 20 })
    expect(analytics.searches.selectionSummary).toEqual({
      selected: 1,
      selectionRate: 100,
    })
    expect(analytics.searches.bySelectedProvider).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'everything-provider', events: 1 }),
    ]))
    expect(analytics.searches.bySelectedCategory).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'plugin', events: 1 }),
    ]))
    expect(analytics.searches.bySelectedPluginId).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'touch-snippets', events: 1 }),
    ]))
    expect(analytics.searches.bySelectedRankBucket).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '2-3', events: 1 }),
    ]))
    expect(analytics.searches.byQueryLengthBucket).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '11-30', events: 1 }),
    ]))
    expect(state.maintenanceSchedules.length).toBeGreaterThan(0)
    expect(state.maintenanceSchedules.at(-1)?.db).toBe(state.db)
  })

  it('records visit governance hotspot metadata from sanitized telemetry', async () => {
    await recordTelemetryEvent(makeEvent(), {
      eventType: 'visit',
      clientId: 'visitor-client',
      platform: 'darwin',
      version: '2.4.10',
      metadata: {
        route: '/admin/governance?token=secret#details',
        page: 'Data Governance',
        surface: 'dashboard-admin',
        referrer: '/dashboard/plugins?query=private',
        source: 'core-app?query=private',
        localHour: 21,
        localDayOfWeek: 5,
        query: 'must not be stored',
      },
    })

    const governanceRows = await listPlatformGovernanceEvents(makeEvent(), {
      scope: 'app',
      action: 'visit',
      limit: 10,
    })
    expect(governanceRows).toHaveLength(1)
    expect(governanceRows[0]).toMatchObject({
      scope: 'app',
      action: 'visit',
      resourceType: 'route',
      resourceId: '/admin/governance',
      channel: 'dashboard-admin',
      unit: 'visit',
      quantity: 1,
    })
    expect(governanceRows[0]?.actorHash).toMatch(/^[a-f0-9]{64}$/)
    expect(governanceRows[0]?.actorHash).not.toBe('visitor-client')
    expect(governanceRows[0]?.metadata).toMatchObject({
      route: '/admin/governance',
      page: 'Data Governance',
      surface: 'dashboard-admin',
      referrer: '/dashboard/plugins',
      source: 'core-app',
      localHour: 21,
      localDayOfWeek: 5,
      countryCode: 'US',
      regionCode: 'CA',
      timezone: 'America/Los_Angeles',
    })
    const serializedRows = JSON.stringify(governanceRows)
    expect(serializedRows).not.toContain('visitor-client')
    expect(serializedRows).not.toContain('secret')
    expect(serializedRows).not.toContain('private')
    expect(serializedRows).not.toContain('must not be stored')

    const analytics = await getPlatformGovernanceAnalytics(makeEvent(), { days: 7, limit: 100, topLimit: 20 })
    expect(analytics.visits.byRoute).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '/admin/governance', events: 1 }),
    ]))
    expect(analytics.visits.byPage).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'Data Governance', events: 1 }),
    ]))
    expect(analytics.visits.bySurface).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'dashboard-admin', events: 1 }),
    ]))
    expect(analytics.visits.byReferrer).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '/dashboard/plugins', events: 1 }),
    ]))
    expect(analytics.visits.byLocalHour).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '21', events: 1 }),
    ]))
    expect(analytics.visits.byLocalTimeSlot).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'evening', events: 1 }),
    ]))
    expect(analytics.visits.byLocalDayOfWeek).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '5', events: 1 }),
    ]))
    expect(analytics.visits.byCountry).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'US', events: 1 }),
    ]))
    expect(analytics.visits.byRegion).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'CA', events: 1 }),
    ]))
    expect(analytics.visits.byTimezone).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'America/Los_Angeles', events: 1 }),
    ]))
  })
})

describe('telemetryStore single-commit writes (#1788)', () => {
  beforeEach(() => {
    state.db = new MockD1Database()
    state.maintenanceSchedules = []
    state.rollupSchedules = []
  })

  const searchEvent = (durationMs: number) => ({
    eventType: 'search' as const,
    clientId: 'client-a',
    platform: 'darwin',
    version: '2.4.14',
    searchDurationMs: durationMs,
    searchResultCount: 3,
    providerTimings: { 'app-provider': durationMs - 10, 'file-provider': durationMs },
    inputTypes: ['text'],
    metadata: { queryType: 'text', searchScene: 'corebox', queryLength: 4 },
    isAnonymous: true,
  })

  it('commits a whole request as one D1 batch, rows and receipt together', async () => {
    const db = state.db as MockD1Database
    // The governance store applies its schema on first use: one batch, once per database. Apply it
    // up front so the batches counted below are the commit's own.
    await listPlatformGovernanceEvents(makeEvent(), { limit: 1 })
    const prepared = await prepareTelemetryWrite(makeEvent(), [searchEvent(120), searchEvent(400)])
    expect(prepared.db).toBe(db)
    expect(prepared.results).toEqual([{ status: 'accepted' }, { status: 'accepted' }])
    // Nothing is written by planning alone.
    expect(db.telemetryRows).toHaveLength(0)
    expect(db.dailyStats.size).toBe(0)

    const batchesBeforeCommit = db.batchSizes.length
    await commitTelemetryWrite(makeEvent(), { db: prepared.db!, batch: prepared.batch! }, {
      extraStatements: [
        buildTelemetryBatchReceiptStatement(db, {
          scope: 'telemetry.batch',
          idempotencyKey: 'sentry:00000000-0000-4000-8000-000000000001',
          payloadHash: 'hash-1',
          response: { success: true, accepted: 2, rejected: 0 },
        }),
      ],
    })

    // Exactly one batch for the commit: the two rows and the receipt. Search counters are no longer
    // written per event; the daily rollup derives them from these rows.
    expect(db.batchSizes).toHaveLength(batchesBeforeCommit + 1)
    expect(db.batchSizes.at(-1)).toBe(3)
    expect(prepared.batch!.size).toBe(2)
    expect(db.standaloneRuns).toEqual([])

    expect(db.telemetryRows).toHaveLength(2)
    expect(db.telemetryRows.every(row => row.search_query === null)).toBe(true)
    expect(db.dailyStats.size).toBe(0)

    expect(db.receiptRows).toHaveLength(1)
    expect(db.receiptRows[0]).toMatchObject({ scope: 'telemetry.batch', payload_hash: 'hash-1' })
    const receipt = await getTelemetryBatchReceipt(makeEvent(), 'telemetry.batch', 'sentry:00000000-0000-4000-8000-000000000001')
    expect(receipt?.response).toEqual({ success: true, accepted: 2, rejected: 0 })

    // Governance follow-ups, retention maintenance and the rollup check run after the commit (the
    // governance store schedules maintenance on its own as well, so the count is not exactly one).
    expect(db.governanceRows).toHaveLength(2)
    expect(state.maintenanceSchedules.some(schedule => schedule.db === db)).toBe(true)
    expect(state.rollupSchedules.some(schedule => schedule.db === db)).toBe(true)
  })

  it('leaves no rows, counters or receipt behind when one statement of the batch fails', async () => {
    const db = state.db as MockD1Database
    const prepared = await prepareTelemetryWrite(makeEvent(), [searchEvent(120), { eventType: 'nope' }])
    expect(prepared.results).toEqual([{ status: 'accepted' }, { status: 'quarantined', reason: 'invalid_event_type' }])

    db.failOn = sql => sql.includes('INSERT INTO telemetry_batch_receipts')
    await expect(commitTelemetryWrite(makeEvent(), { db: prepared.db!, batch: prepared.batch! }, {
      extraStatements: [
        buildTelemetryBatchReceiptStatement(db, {
          scope: 'telemetry.batch',
          idempotencyKey: 'sentry:00000000-0000-4000-8000-000000000002',
          payloadHash: 'hash-2',
          response: { success: true },
        }),
      ],
    })).rejects.toThrow('D1 statement failed')

    expect(db.telemetryRows).toHaveLength(0)
    expect(db.quarantineRows).toBe(0)
    expect(db.dailyStats.size).toBe(0)
    expect(db.receiptRows).toHaveLength(0)
    expect(db.governanceRows).toHaveLength(0)
    expect(state.maintenanceSchedules).toHaveLength(0)

    // The retry then finds no receipt and writes everything, exactly once.
    db.failOn = null
    const retried = await prepareTelemetryWrite(makeEvent(), [searchEvent(120), { eventType: 'nope' }])
    await commitTelemetryWrite(makeEvent(), { db: retried.db!, batch: retried.batch! })
    expect(db.telemetryRows).toHaveLength(1)
    expect(db.quarantineRows).toBe(1)
  })

  it('reports every event as dropped without a database and writes nothing', async () => {
    state.db = null
    const prepared = await prepareTelemetryWrite(makeEvent(), [searchEvent(120)])
    expect(prepared.db).toBeNull()
    expect(prepared.batch).toBeNull()
    expect(prepared.results).toEqual([{ status: 'dropped', reason: 'database_unavailable' }])
    await expect(recordTelemetryEvent(makeEvent(), searchEvent(120))).resolves.toEqual({
      status: 'dropped',
      reason: 'database_unavailable',
    })
  })

  it('merges increments, maxima and minima per counter before they become statements', () => {
    const db = state.db as MockD1Database
    const batch = new TelemetryWriteBatch(db as any)
    batch.inc('2026-10-08', 'searches', '', 1)
    batch.inc('2026-10-08', 'searches', '', 1)
    batch.inc('2026-10-08', 'searches', '', 1)
    batch.max('2026-10-08', 'search_duration_max', '', 4)
    batch.max('2026-10-08', 'search_duration_max', '', 9)
    batch.min('2026-10-08', 'search_duration_min', '', 7)
    batch.min('2026-10-08', 'search_duration_min', '', 2)
    batch.inc('2026-10-09', 'searches', '', 5)

    expect(batch.size).toBe(4)
    const statements = batch.toStatements() as unknown as Array<{ run: () => Promise<unknown> }>
    expect(statements).toHaveLength(4)
    return db.batch(statements as any).then(() => {
      expect(db.dailyStats.get('2026-10-08:searches:')?.value).toBe(3)
      expect(db.dailyStats.get('2026-10-08:search_duration_max:')?.value).toBe(9)
      expect(db.dailyStats.get('2026-10-08:search_duration_min:')?.value).toBe(2)
      expect(db.dailyStats.get('2026-10-09:searches:')?.value).toBe(5)
    })
  })
})
