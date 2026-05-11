import type { ProviderRegistryRecord } from './providerRegistryStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLatestProviderHealthChecks, listProviderHealthChecks, recordProviderHealthCheck } from './providerHealthStore'

interface HealthRow {
  id: string
  provider_id: string
  provider_name: string
  vendor: string
  capability: string
  status: string
  latency_ms: number
  endpoint: string
  request_id: string | null
  degraded_reason: string | null
  error_code: string | null
  error_message: string | null
  checked_at: string
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
  rows = new Map<string, HealthRow>()
  schemaStatements = 0

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
      this.schemaStatements += 1
      return { meta: { changes: 0 } }
    }

    if (sql.includes('INSERT INTO provider_health_checks')) {
      const [
        id,
        providerId,
        providerName,
        vendor,
        capability,
        status,
        latencyMs,
        endpoint,
        requestId,
        degradedReason,
        errorCode,
        errorMessage,
        checkedAt,
      ] = args
      this.rows.set(String(id), {
        id: String(id),
        provider_id: String(providerId),
        provider_name: String(providerName),
        vendor: String(vendor),
        capability: String(capability),
        status: String(status),
        latency_ms: Number(latencyMs),
        endpoint: String(endpoint),
        request_id: requestId == null ? null : String(requestId),
        degraded_reason: degradedReason == null ? null : String(degradedReason),
        error_code: errorCode == null ? null : String(errorCode),
        error_message: errorMessage == null ? null : String(errorMessage),
        checked_at: String(checkedAt),
      })
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('COUNT(*) AS total'))
      return { total: this.filterRows(sql, args).length }
    return null
  }

  all(sql: string, args: any[]) {
    if (!sql.includes('FROM provider_health_checks'))
      return []
    if (!sql.includes('LIMIT'))
      return this.filterRows(sql, args)
    const limit = Number(args.at(-2) ?? 50)
    const offset = Number(args.at(-1) ?? 0)
    return this.filterRows(sql, args.slice(0, -2)).slice(offset, offset + limit)
  }

  private filterRows(sql: string, args: any[]) {
    let rows = [...this.rows.values()]

    if (sql.includes('provider_id IN')) {
      const capabilityFilterCount = sql.includes('capability = ?') ? 1 : 0
      const providerIds = new Set(args.slice(0, args.length - capabilityFilterCount).map(String))
      rows = rows.filter(row => providerIds.has(row.provider_id))
    }

    const filters: Array<[string, keyof HealthRow]> = [
      ['capability = ?', 'capability'],
      ['status = ?', 'status'],
    ]
    const activeFilters = filters.filter(([fragment]) => sql.includes(fragment))
    const filterArgs = sql.includes('provider_id IN')
      ? args.slice(args.length - activeFilters.length)
      : args

    if (sql.includes('provider_id = ?') && !sql.includes('provider_id IN')) {
      rows = rows.filter(row => row.provider_id === String(args[0]))
      filterArgs.shift()
    }

    return rows
      .filter(row => activeFilters.every(([, column], index) => String(row[column]) === String(filterArgs[index])))
      .sort((a, b) => b.checked_at.localeCompare(a.checked_at))
  }
}

const state = vi.hoisted(() => ({
  db: null as MockD1Database | null,
}))

vi.mock('./cloudflare', () => ({
  readCloudflareBindings: () => state.db ? { DB: state.db } : undefined,
}))

const event = {} as any

function provider(overrides: Partial<ProviderRegistryRecord> = {}): ProviderRegistryRecord {
  return {
    id: 'prv_tencent_cloud_mt',
    name: 'tencent-cloud-mt-main',
    displayName: 'Tencent Cloud Machine Translation',
    vendor: 'tencent-cloud',
    status: 'enabled',
    authType: 'secret_pair',
    authRef: 'secure://providers/tencent-cloud-mt-main',
    ownerScope: 'system',
    ownerId: null,
    description: null,
    endpoint: 'https://tmt.tencentcloudapi.com',
    region: 'ap-shanghai',
    metadata: null,
    capabilities: [],
    createdBy: 'admin_1',
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('providerHealthStore', () => {
  beforeEach(() => {
    state.db = new MockD1Database()
  })

  it('记录成功 provider check 为 healthy 并可查询 latency 历史', async () => {
    await recordProviderHealthCheck(event, provider(), {
      success: true,
      providerId: 'prv_tencent_cloud_mt',
      capability: 'text.translate',
      latency: 42,
      endpoint: 'https://tmt.tencentcloudapi.com',
      requestId: 'req-1',
      message: 'ok',
    })

    const result = await listProviderHealthChecks(event, {
      providerId: 'prv_tencent_cloud_mt',
    })

    expect(result.total).toBe(1)
    expect(result.entries[0]).toMatchObject({
      providerId: 'prv_tencent_cloud_mt',
      providerName: 'Tencent Cloud Machine Translation',
      vendor: 'tencent-cloud',
      capability: 'text.translate',
      status: 'healthy',
      latencyMs: 42,
      requestId: 'req-1',
      degradedReason: null,
    })
  })

  it('记录失败 provider check 为 unhealthy，并保留 degraded reason', async () => {
    await recordProviderHealthCheck(event, provider(), {
      success: false,
      capability: 'text.translate',
      latency: 88,
      endpoint: 'https://tmt.tencentcloudapi.com',
      message: 'secret id not found',
      error: {
        code: 'AuthFailure.SecretIdNotFound',
        message: 'secret id not found',
        status: 200,
      },
    })

    const result = await listProviderHealthChecks(event, {
      status: 'unhealthy',
    })

    expect(result.entries[0]).toMatchObject({
      status: 'unhealthy',
      degradedReason: 'AuthFailure.SecretIdNotFound',
      errorCode: 'AuthFailure.SecretIdNotFound',
      errorMessage: 'secret id not found',
    })
  })

  it('schema guard 按 D1 binding 实例隔离', async () => {
    const firstDb = state.db!
    await recordProviderHealthCheck(event, provider(), {
      success: true,
      capability: 'text.translate',
      latency: 1,
      endpoint: 'https://tmt.tencentcloudapi.com',
      message: 'ok',
    })
    expect(firstDb.schemaStatements).toBeGreaterThan(0)

    const secondDb = new MockD1Database()
    state.db = secondDb
    await recordProviderHealthCheck(event, provider(), {
      success: true,
      capability: 'text.translate',
      latency: 1,
      endpoint: 'https://tmt.tencentcloudapi.com',
      message: 'ok',
    })

    expect(secondDb.schemaStatements).toBeGreaterThan(0)
  })

  it('可按 providerId 批量读取最新 health check 供策略路由使用', async () => {
    await recordProviderHealthCheck(event, provider({ id: 'prv_fast', displayName: 'Fast Provider' }), {
      success: true,
      capability: 'text.translate',
      latency: 12,
      endpoint: 'https://fast.example.com',
      message: 'ok',
    })
    await recordProviderHealthCheck(event, provider({ id: 'prv_slow', displayName: 'Slow Provider' }), {
      success: true,
      capability: 'text.translate',
      latency: 120,
      endpoint: 'https://slow.example.com',
      message: 'ok',
    })

    const result = await getLatestProviderHealthChecks(event, {
      providerIds: ['prv_slow', 'prv_fast'],
      capability: 'text.translate',
    })

    expect(result.get('prv_fast')).toMatchObject({
      providerId: 'prv_fast',
      latencyMs: 12,
    })
    expect(result.get('prv_slow')).toMatchObject({
      providerId: 'prv_slow',
      latencyMs: 120,
    })
  })
})
