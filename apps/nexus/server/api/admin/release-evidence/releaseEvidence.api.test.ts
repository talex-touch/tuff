import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
    return [...this.runs.values()]
      .filter(row => filters.every((column, index) => String((row as any)[column]) === String(args[index])))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
}

const authMocks = vi.hoisted(() => ({
  requireAdminOrApiKey: vi.fn(),
}))

const readBodyMock = vi.hoisted(() => vi.fn())

const state = vi.hoisted(() => ({
  db: null as MockD1Database | null,
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: readBodyMock,
  }
})

vi.mock('../../../utils/auth', () => authMocks)
vi.mock('../../../utils/cloudflare', () => ({
  readCloudflareBindings: () => state.db ? { DB: state.db } : undefined,
}))

let createRunHandler: (event: any) => Promise<any>
let listRunsHandler: (event: any) => Promise<any>
let getRunHandler: (event: any) => Promise<any>
let upsertItemHandler: (event: any) => Promise<any>
let matrixHandler: (event: any) => Promise<any>
let docGuardHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  createRunHandler = (await import('./runs.post')).default as (event: any) => Promise<any>
  listRunsHandler = (await import('./runs.get')).default as (event: any) => Promise<any>
  getRunHandler = (await import('./runs/[runId].get')).default as (event: any) => Promise<any>
  upsertItemHandler = (await import('./runs/[runId]/items.post')).default as (event: any) => Promise<any>
  matrixHandler = (await import('./matrix.get')).default as (event: any) => Promise<any>
  docGuardHandler = (await import('./doc-guard.post')).default as (event: any) => Promise<any>
})

function makeEvent(url = '/api/admin/release-evidence/runs', params: Record<string, string> = {}) {
  return {
    path: url,
    node: { req: { url } },
    context: { params },
  }
}

describe('/api/admin/release-evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.db = new MockD1Database()
    authMocks.requireAdminOrApiKey.mockResolvedValue({
      userId: 'admin_1',
      authType: 'admin',
    })
  })

  it('管理员登录态可以创建 run', async () => {
    readBodyMock.mockResolvedValue({
      version: '2.5.0',
      platform: 'windows',
      scope: 'core-app',
      status: 'running',
      notes: 'smoke',
    })

    const result = await createRunHandler(makeEvent())

    expect(authMocks.requireAdminOrApiKey).toHaveBeenCalledWith(expect.anything(), ['release:evidence'])
    expect(result.run).toMatchObject({
      version: '2.5.0',
      platform: 'windows',
      scope: 'core-app',
      status: 'running',
      createdBy: 'admin_1',
    })
  })

  it('带 release:evidence scope 的 API key 可以写入 item', async () => {
    authMocks.requireAdminOrApiKey.mockResolvedValue({
      userId: 'ci_bot',
      authType: 'apiKey',
      scopes: ['release:evidence'],
    })
    readBodyMock.mockResolvedValue({
      version: '2.5.0',
      platform: 'all',
      scope: 'docs',
    })
    const run = await createRunHandler(makeEvent())

    readBodyMock.mockResolvedValue({
      category: 'docs',
      caseId: 'docs-guard',
      status: 'passed',
      requiredForRelease: true,
      evidence: { command: 'pnpm docs:guard', code: 0 },
    })
    const result = await upsertItemHandler(makeEvent('/api/admin/release-evidence/runs/run/items', { runId: run.run.id }))

    expect(authMocks.requireAdminOrApiKey).toHaveBeenLastCalledWith(expect.anything(), ['release:evidence'])
    expect(result.item).toMatchObject({
      runId: run.run.id,
      caseId: 'docs-guard',
      status: 'passed',
    })
  })

  it('普通用户或缺 scope API key 返回 403', async () => {
    authMocks.requireAdminOrApiKey.mockRejectedValue({ statusCode: 403, statusMessage: 'Insufficient API key scopes.' })

    await expect(listRunsHandler(makeEvent('/api/admin/release-evidence/runs'))).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('无 D1 返回 500', async () => {
    state.db = null
    readBodyMock.mockResolvedValue({
      version: '2.5.0',
      platform: 'windows',
      scope: 'core-app',
    })

    await expect(createRunHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Database not available',
    })
  })

  it('非法 enum、空 version、超大 evidence 返回 400', async () => {
    readBodyMock.mockResolvedValue({
      version: '',
      platform: 'windows',
      scope: 'core-app',
    })
    await expect(createRunHandler(makeEvent())).rejects.toMatchObject({ statusCode: 400 })

    readBodyMock.mockResolvedValue({
      version: '2.5.0',
      platform: 'ios',
      scope: 'core-app',
    })
    await expect(createRunHandler(makeEvent())).rejects.toMatchObject({ statusCode: 400 })

    readBodyMock.mockResolvedValue({
      version: '2.5.0',
      platform: 'all',
      scope: 'docs',
    })
    const run = await createRunHandler(makeEvent())

    readBodyMock.mockResolvedValue({
      category: 'docs',
      caseId: 'docs-guard',
      status: 'passed',
      evidence: { output: 'x'.repeat(129 * 1024) },
    })
    await expect(upsertItemHandler(makeEvent('/api/admin/release-evidence/runs/run/items', { runId: run.run.id }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('可以查询 run、matrix，并通过 doc-guard 快速写入', async () => {
    readBodyMock.mockResolvedValue({
      version: '2.5.0',
      status: 'passed',
      evidence: { command: 'pnpm docs:guard', code: 0 },
      notes: 'docs ok',
    })

    const docGuard = await docGuardHandler(makeEvent('/api/admin/release-evidence/doc-guard'))
    const loaded = await getRunHandler(makeEvent('/api/admin/release-evidence/runs/run', { runId: docGuard.run.id }))
    const matrix = await matrixHandler(makeEvent('/api/admin/release-evidence/matrix?version=2.5.0'))

    expect(loaded.items[0]).toMatchObject({
      caseId: 'docs-guard',
      status: 'passed',
    })
    expect(matrix.docsGuard?.status).toBe('passed')
  })

  it('doc-guard item 输入非法时不会留下 run', async () => {
    readBodyMock.mockResolvedValue({
      version: '2.5.0',
      status: 'passed',
      evidence: { output: 'x'.repeat(129 * 1024) },
    })

    await expect(docGuardHandler(makeEvent('/api/admin/release-evidence/doc-guard'))).rejects.toMatchObject({
      statusCode: 400,
    })

    expect(state.db?.runs.size).toBe(0)
    expect(state.db?.items.size).toBe(0)
  })
})
