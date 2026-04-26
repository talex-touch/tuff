import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createReleaseEvidenceRun,
  getReleaseEvidenceMatrix,
  getReleaseEvidenceRun,
  listReleaseEvidenceRuns,
  upsertReleaseEvidenceItem,
} from './releaseEvidenceStore'

interface RunRow {
  id: string
  version: string
  platform: string
  scope: string
  status: string
  created_by: string
  notes: string | null
  created_at: string
  updated_at: string
}

interface ItemRow {
  id: string
  run_id: string
  category: string
  case_id: string
  status: string
  required_for_release: number
  evidence_json: string
  notes: string | null
  created_at: string
  updated_at: string
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
  runs = new Map<string, RunRow>()
  items = new Map<string, ItemRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
      return { meta: { changes: 0 } }
    }

    if (sql.includes('INSERT INTO release_evidence_runs')) {
      const [id, version, platform, scope, status, createdBy, notes, createdAt, updatedAt] = args
      this.runs.set(String(id), {
        id: String(id),
        version: String(version),
        platform: String(platform),
        scope: String(scope),
        status: String(status),
        created_by: String(createdBy),
        notes: notes == null ? null : String(notes),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO release_evidence_items')) {
      const [id, runId, category, caseId, status, requiredForRelease, evidenceJson, notes, createdAt, updatedAt] = args
      const key = `${runId}:${caseId}`
      const existing = this.items.get(key)
      this.items.set(key, {
        id: existing?.id ?? String(id),
        run_id: String(runId),
        category: String(category),
        case_id: String(caseId),
        status: String(status),
        required_for_release: Number(requiredForRelease),
        evidence_json: String(evidenceJson),
        notes: notes == null ? null : String(notes),
        created_at: existing?.created_at ?? String(createdAt),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('COUNT(*) AS total') && sql.includes('release_evidence_runs')) {
      return { total: this.filterRuns(sql, args).length }
    }

    if (sql.includes('FROM release_evidence_runs') && sql.includes('id = ?')) {
      return this.runs.get(String(args[0])) ?? null
    }

    if (sql.includes('FROM release_evidence_items') && sql.includes('run_id = ?') && sql.includes('case_id = ?')) {
      return this.items.get(`${args[0]}:${args[1]}`) ?? null
    }

    return null
  }

  all(sql: string, args: any[]) {
    if (sql.includes('FROM release_evidence_runs')) {
      if (!sql.includes('LIMIT'))
        return this.filterRuns(sql, args)
      const limitIndex = args.length - 2
      const limit = Number(args[limitIndex] ?? 50)
      const offset = Number(args[limitIndex + 1] ?? 0)
      return this.filterRuns(sql, args).slice(offset, offset + limit)
    }

    if (sql.includes('FROM release_evidence_items') && sql.includes('run_id IN')) {
      const runIds = new Set(args.map(String))
      return [...this.items.values()].filter(row => runIds.has(row.run_id))
    }

    if (sql.includes('FROM release_evidence_items') && sql.includes('run_id = ?')) {
      return [...this.items.values()].filter(row => row.run_id === String(args[0]))
    }

    return []
  }

  private filterRuns(sql: string, args: any[]) {
    const filters = ['version', 'platform', 'scope', 'status'].filter(column => sql.includes(`${column} = ?`))
    const rows = [...this.runs.values()]
      .filter(row => filters.every((column, index) => String((row as any)[column]) === String(args[index])))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    return rows
  }
}

const state = vi.hoisted(() => ({
  db: null as MockD1Database | null,
}))

vi.mock('./cloudflare', () => ({
  readCloudflareBindings: () => state.db ? { DB: state.db } : undefined,
}))

const event = {} as any

describe('releaseEvidenceStore', () => {
  beforeEach(() => {
    state.db = new MockD1Database()
  })

  it('schema 可重复初始化并创建、查询 run', async () => {
    const run = await createReleaseEvidenceRun(event, {
      version: '2.5.0',
      platform: 'windows',
      scope: 'core-app',
      status: 'running',
      createdBy: 'admin',
      notes: 'smoke',
    })

    await createReleaseEvidenceRun(event, {
      version: '2.5.0',
      platform: 'macos',
      scope: 'core-app',
      createdBy: 'admin',
    })

    const list = await listReleaseEvidenceRuns(event, { version: '2.5.0', limit: 10 })
    const loaded = await getReleaseEvidenceRun(event, run.id)

    expect(list.total).toBe(2)
    expect(loaded?.run).toMatchObject({
      id: run.id,
      version: '2.5.0',
      platform: 'windows',
      scope: 'core-app',
      status: 'running',
    })
  })

  it('item 按 runId + caseId upsert', async () => {
    const run = await createReleaseEvidenceRun(event, {
      version: '2.5.0',
      platform: 'windows',
      scope: 'core-app',
      createdBy: 'admin',
    })

    const first = await upsertReleaseEvidenceItem(event, run.id, {
      category: 'core-regression',
      caseId: 'corebox-search',
      status: 'failed',
      requiredForRelease: true,
      evidence: { command: 'pnpm core:test', code: 1 },
    })
    const second = await upsertReleaseEvidenceItem(event, run.id, {
      category: 'core-regression',
      caseId: 'corebox-search',
      status: 'passed',
      requiredForRelease: true,
      evidence: { command: 'pnpm core:test', code: 0 },
    })

    const loaded = await getReleaseEvidenceRun(event, run.id)

    expect(second.id).toBe(first.id)
    expect(loaded?.items).toHaveLength(1)
    expect(loaded?.items[0]).toMatchObject({
      caseId: 'corebox-search',
      status: 'passed',
      evidence: { command: 'pnpm core:test', code: 0 },
    })
  })

  it('matrix 聚合平台阻塞、Linux best-effort 和 docs guard', async () => {
    const windows = await createReleaseEvidenceRun(event, {
      version: '2.5.0',
      platform: 'windows',
      scope: 'core-app',
      createdBy: 'admin',
    })
    const macos = await createReleaseEvidenceRun(event, {
      version: '2.5.0',
      platform: 'macos',
      scope: 'core-app',
      createdBy: 'admin',
    })
    const linux = await createReleaseEvidenceRun(event, {
      version: '2.5.0',
      platform: 'linux',
      scope: 'core-app',
      createdBy: 'admin',
    })
    const docs = await createReleaseEvidenceRun(event, {
      version: '2.5.0',
      platform: 'all',
      scope: 'docs',
      createdBy: 'admin',
    })

    await upsertReleaseEvidenceItem(event, windows.id, {
      category: 'smoke',
      caseId: 'install',
      status: 'blocked',
      requiredForRelease: true,
      evidence: { ciUrl: 'https://ci.local/windows' },
    })
    await upsertReleaseEvidenceItem(event, macos.id, {
      category: 'smoke',
      caseId: 'install',
      status: 'failed',
      requiredForRelease: true,
      evidence: { ciUrl: 'https://ci.local/macos' },
    })
    await upsertReleaseEvidenceItem(event, linux.id, {
      category: 'smoke',
      caseId: 'install',
      status: 'best_effort',
      requiredForRelease: false,
      evidence: { summary: 'package verified only' },
    })
    await upsertReleaseEvidenceItem(event, docs.id, {
      category: 'docs',
      caseId: 'docs-guard',
      status: 'passed',
      requiredForRelease: true,
      evidence: { command: 'pnpm docs:guard' },
    })

    const matrix = await getReleaseEvidenceMatrix(event, '2.5.0')

    expect(matrix.summary.blocking).toBe(2)
    expect(matrix.platforms.windows.status).toBe('blocked')
    expect(matrix.platforms.macos.status).toBe('blocked')
    expect(matrix.platforms.linux.status).toBe('best_effort')
    expect(matrix.docsGuard?.status).toBe('passed')
  })

  it('evidence_json 解析失败时返回空对象', async () => {
    const run = await createReleaseEvidenceRun(event, {
      version: '2.5.0',
      platform: 'all',
      scope: 'docs',
      createdBy: 'admin',
    })

    state.db?.items.set(`${run.id}:docs-guard`, {
      id: 'item_bad_json',
      run_id: run.id,
      category: 'docs',
      case_id: 'docs-guard',
      status: 'failed',
      required_for_release: 1,
      evidence_json: '{bad-json',
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const loaded = await getReleaseEvidenceRun(event, run.id)

    expect(loaded?.items[0]?.evidence).toEqual({})
  })

  it('无 D1 时返回 500', async () => {
    state.db = null

    await expect(createReleaseEvidenceRun(event, {
      version: '2.5.0',
      platform: 'windows',
      scope: 'core-app',
      createdBy: 'admin',
    })).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Database not available',
    })
  })
})
