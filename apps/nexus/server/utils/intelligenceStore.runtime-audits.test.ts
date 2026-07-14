import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listRuntimeAudits } from './intelligenceStore'

interface RuntimeAuditRow {
  id: string
  user_id: string
  provider_id: string
  provider_type: string
  provider_name: string | null
  model: string
  endpoint: string | null
  status: number | null
  latency: number | null
  success: number
  error_message: string | null
  trace_id: string | null
  metadata: string
  created_at: string
}

class RuntimeAuditStatement {
  private args: unknown[] = []

  constructor(
    private readonly db: RuntimeAuditD1Fake,
    private readonly sql: string,
  ) {}

  bind(...args: unknown[]) {
    this.args = args
    return this
  }

  async run() {
    return { meta: { changes: 0 } }
  }

  async all<T>() {
    return this.db.all<T>(this.sql, this.args)
  }
}

class RuntimeAuditD1Fake {
  constructor(private readonly audits: RuntimeAuditRow[]) {}

  prepare(sql: string) {
    return new RuntimeAuditStatement(this, sql)
  }

  all<T>(sql: string, args: unknown[]) {
    if (!sql.includes('FROM intelligence_audits a'))
      return { results: [] as T[] }

    const [createdAfter, ...sourcePatternsAndLimit] = args
    const limit = sourcePatternsAndLimit.at(-1)
    if (typeof createdAfter !== 'string' || typeof limit !== 'number')
      throw new Error('Expected the runtime audit query to bind its date window and limit.')

    const sources = sourcePatternsAndLimit
      .filter((value): value is string => typeof value === 'string')
      .map(pattern => pattern.match(/"source":"([^"]+)"/)?.[1])
      .filter((source): source is string => Boolean(source))

    return {
      results: this.audits
        .filter((audit) => {
          const metadata = JSON.parse(audit.metadata) as { source?: string }
          return audit.created_at >= createdAfter && sources.includes(metadata.source ?? '')
        })
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .slice(0, limit) as T[],
    }
  }
}

function runtimeAudit(
  id: string,
  source: string,
  createdAt: string,
  success: number,
): RuntimeAuditRow {
  return {
    id,
    user_id: 'admin-1',
    provider_id: 'runtime',
    provider_type: 'runtime',
    provider_name: 'Runtime provider',
    model: 'agent-runtime',
    endpoint: null,
    status: success ? 200 : 500,
    latency: 42,
    success,
    error_message: success ? null : 'runtime failed',
    trace_id: `trace-${id}`,
    metadata: JSON.stringify({ source, runId: id }),
    created_at: createdAt,
  }
}

function createEvent(db: RuntimeAuditD1Fake): H3Event {
  return {
    context: {
      cloudflare: { env: { DB: db } },
    },
  } as unknown as H3Event
}

afterEach(() => {
  vi.useRealTimers()
})

describe('listRuntimeAudits', () => {
  it('returns only current and legacy runtime audits inside the requested window, ordered and limited', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z'))

    const db = new RuntimeAuditD1Fake([
      runtimeAudit('current-recent', 'intelligence-agent-runtime', '2026-07-14T11:00:00.000Z', 1),
      runtimeAudit('legacy-recent', 'intelligence-lab-runtime', '2026-07-14T10:00:00.000Z', 0),
      runtimeAudit('legacy-limited', 'intelligence-lab-runtime', '2026-07-14T09:00:00.000Z', 1),
      runtimeAudit('unrelated-newer', 'intelligence-dashboard', '2026-07-14T11:30:00.000Z', 1),
      runtimeAudit('current-expired', 'intelligence-agent-runtime', '2026-07-07T11:59:59.999Z', 1),
    ])

    const audits = await listRuntimeAudits(createEvent(db), { days: 7, limit: 2 })

    expect(audits).toEqual([
      expect.objectContaining({
        id: 'current-recent',
        providerName: 'Runtime provider',
        success: true,
        metadata: { source: 'intelligence-agent-runtime', runId: 'current-recent' },
        createdAt: '2026-07-14T11:00:00.000Z',
      }),
      expect.objectContaining({
        id: 'legacy-recent',
        providerName: 'Runtime provider',
        success: false,
        errorMessage: 'runtime failed',
        metadata: { source: 'intelligence-lab-runtime', runId: 'legacy-recent' },
        createdAt: '2026-07-14T10:00:00.000Z',
      }),
    ])
  })
})
