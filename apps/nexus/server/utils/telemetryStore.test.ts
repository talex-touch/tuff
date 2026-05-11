import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAnalyticsSummary, recordTelemetryEvent } from './telemetryStore'

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

class MockD1Database {
  telemetryRows: TelemetryRow[] = []
  dailyStats = new Map<string, DailyStatRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX') || sql.includes('ALTER TABLE')) {
      return { meta: { changes: 0 } }
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

  first(_sql: string, _args: any[]) {
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

    return []
  }
}

const state = vi.hoisted(() => ({
  db: null as MockD1Database | null,
}))

vi.mock('./cloudflare', () => ({
  readCloudflareBindings: () => state.db ? { DB: state.db } : undefined,
  shouldUseCloudflareBindings: () => true,
}))

vi.mock('./ipSecurityStore', () => ({
  resolveRequestIp: () => '127.0.0.1',
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
  })

  it('records anonymous provider metrics without search query text', async () => {
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
        firstResultMs: 180,
        firstResultCount: 3,
        sortingDuration: 15,
        searchScene: 'text',
        providerResults: {
          'app-provider': 3,
          'everything-provider': 2,
        },
        providerStatus: {
          'app-provider': 'success',
          'everything-provider': 'timeout',
        },
      },
      isAnonymous: true,
    })

    const row = state.db!.telemetryRows[0]
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
  })
})
