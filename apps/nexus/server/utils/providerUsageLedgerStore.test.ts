import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listProviderUsageLedgerEntries, recordProviderUsageLedger } from './providerUsageLedgerStore'
import type { SceneRunResult } from './sceneOrchestrator'

interface LedgerRow {
  id: string
  run_id: string
  scene_id: string
  mode: string
  status: string
  strategy_mode: string
  capability: string | null
  provider_id: string | null
  unit: string
  quantity: number
  billable: number
  estimated: number
  pricing_ref: string | null
  provider_usage_ref: string | null
  error_code: string | null
  error_message: string | null
  trace_json: string
  fallback_trail_json: string
  selected_json: string
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

class MockD1Database {
  rows = new Map<string, LedgerRow>()
  schemaStatements = 0

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
      this.schemaStatements += 1
      return { meta: { changes: 0 } }
    }

    if (sql.includes('INSERT INTO provider_usage_ledger')) {
      const [
        id,
        runId,
        sceneId,
        mode,
        status,
        strategyMode,
        capability,
        providerId,
        unit,
        quantity,
        billable,
        estimated,
        pricingRef,
        providerUsageRef,
        errorCode,
        errorMessage,
        traceJson,
        fallbackTrailJson,
        selectedJson,
        createdAt,
      ] = args
      this.rows.set(String(id), {
        id: String(id),
        run_id: String(runId),
        scene_id: String(sceneId),
        mode: String(mode),
        status: String(status),
        strategy_mode: String(strategyMode),
        capability: capability == null ? null : String(capability),
        provider_id: providerId == null ? null : String(providerId),
        unit: String(unit),
        quantity: Number(quantity),
        billable: Number(billable),
        estimated: Number(estimated),
        pricing_ref: pricingRef == null ? null : String(pricingRef),
        provider_usage_ref: providerUsageRef == null ? null : String(providerUsageRef),
        error_code: errorCode == null ? null : String(errorCode),
        error_message: errorMessage == null ? null : String(errorMessage),
        trace_json: String(traceJson),
        fallback_trail_json: String(fallbackTrailJson),
        selected_json: String(selectedJson),
        created_at: String(createdAt),
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
    if (!sql.includes('FROM provider_usage_ledger'))
      return []
    const limit = Number(args.at(-2) ?? 50)
    const offset = Number(args.at(-1) ?? 0)
    return this.filterRows(sql, args.slice(0, -2)).slice(offset, offset + limit)
  }

  private filterRows(sql: string, args: any[]) {
    const filters: Array<[string, keyof LedgerRow]> = [
      ['run_id = ?', 'run_id'],
      ['scene_id = ?', 'scene_id'],
      ['provider_id = ?', 'provider_id'],
      ['capability = ?', 'capability'],
      ['status = ?', 'status'],
      ['mode = ?', 'mode'],
    ]
    const activeFilters = filters.filter(([fragment]) => sql.includes(fragment))

    return [...this.rows.values()]
      .filter(row => activeFilters.every(([, column], index) => String(row[column]) === String(args[index])))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
}

const state = vi.hoisted(() => ({
  db: null as MockD1Database | null,
}))

vi.mock('./cloudflare', () => ({
  readCloudflareBindings: () => state.db ? { DB: state.db } : undefined,
}))

const event = {} as any

function completedRun(): SceneRunResult {
  return {
    runId: 'scene_run_1',
    sceneId: 'corebox.selection.translate',
    status: 'completed',
    mode: 'execute',
    strategyMode: 'priority',
    requestedCapabilities: ['text.translate'],
    selected: [
      {
        providerId: 'prv_tencent_cloud_mt',
        providerName: 'Tencent Cloud Machine Translation',
        vendor: 'tencent-cloud',
        capability: 'text.translate',
        priority: 10,
        weight: null,
        bindingId: 'binding_text_translate',
        authRef: 'secure://providers/tencent-cloud-mt-main',
        endpoint: 'https://tmt.tencentcloudapi.com',
        region: 'ap-shanghai',
      },
    ],
    candidates: [],
    fallbackTrail: [
      {
        providerId: 'prv_tencent_cloud_mt',
        capability: 'text.translate',
        status: 'selected',
      },
    ],
    trace: [
      {
        phase: 'adapter.dispatch',
        status: 'success',
        at: '2026-05-10T00:00:00.000Z',
        message: 'Provider adapter completed text.translate.',
        metadata: {
          providerRequestId: 'req_tencent_1',
          latencyMs: 42,
        },
      },
    ],
    usage: [
      {
        unit: 'character',
        quantity: 5,
        billable: true,
        providerId: 'prv_tencent_cloud_mt',
        capability: 'text.translate',
        estimated: true,
        providerUsageRef: 'req_tencent_1',
      },
    ],
    output: {
      translatedText: '你好',
    },
  }
}

describe('providerUsageLedgerStore', () => {
  beforeEach(() => {
    state.db = new MockD1Database()
  })

  it('记录 scene run usage 时只保存安全元数据，不保存 output/input', async () => {
    await recordProviderUsageLedger(event, completedRun())

    const result = await listProviderUsageLedgerEntries(event, {
      sceneId: 'corebox.selection.translate',
      limit: 10,
    })

    expect(result.total).toBe(1)
    expect(result.entries[0]).toMatchObject({
      runId: 'scene_run_1',
      sceneId: 'corebox.selection.translate',
      status: 'completed',
      mode: 'execute',
      providerId: 'prv_tencent_cloud_mt',
      capability: 'text.translate',
      unit: 'character',
      quantity: 5,
      billable: true,
      estimated: true,
      providerUsageRef: 'req_tencent_1',
    })
    const serialized = JSON.stringify([...state.db!.rows.values()])
    expect(serialized).not.toContain('translatedText')
    expect(serialized).not.toContain('你好')
    expect(serialized).not.toContain('authRef')
  })

  it('失败或 dry-run 没有 usage 时写入 run 级审计记录', async () => {
    const run: SceneRunResult = {
      ...completedRun(),
      runId: 'scene_run_failed',
      status: 'failed',
      mode: 'dry_run',
      selected: [],
      usage: [],
      output: null,
      error: {
        code: 'CAPABILITY_UNSUPPORTED',
        message: 'No enabled provider capability is available for text.translate.',
      },
    }

    await recordProviderUsageLedger(event, run)

    const result = await listProviderUsageLedgerEntries(event, {
      runId: 'scene_run_failed',
      status: 'failed',
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({
      runId: 'scene_run_failed',
      status: 'failed',
      mode: 'dry_run',
      unit: 'run',
      quantity: 1,
      billable: false,
      errorCode: 'CAPABILITY_UNSUPPORTED',
    })
  })

  it('schema guard 按 D1 binding 实例隔离', async () => {
    const firstDb = state.db!
    await recordProviderUsageLedger(event, completedRun())
    expect(firstDb.schemaStatements).toBeGreaterThan(0)

    const secondDb = new MockD1Database()
    state.db = secondDb
    await recordProviderUsageLedger(event, completedRun())

    expect(secondDb.schemaStatements).toBeGreaterThan(0)
  })
})
