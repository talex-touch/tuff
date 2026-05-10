import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface SceneRow {
  id: string
  display_name: string
  owner: string
  owner_scope: string
  owner_id: string | null
  status: string
  required_capabilities: string
  strategy_mode: string
  fallback: string
  metering_policy: string | null
  audit_policy: string | null
  metadata: string | null
  created_by: string
  created_at: string
  updated_at: string
}

interface BindingRow {
  id: string
  scene_id: string
  provider_id: string
  capability: string
  priority: number
  weight: number | null
  status: string
  constraints_json: string | null
  metadata: string | null
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
  scenes = new Map<string, SceneRow>()
  bindings = new Map<string, BindingRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
      return { meta: { changes: 0 } }
    }

    if (sql.includes('INSERT INTO scene_registry')) {
      const [
        id,
        displayName,
        owner,
        ownerScope,
        ownerId,
        status,
        requiredCapabilities,
        strategyMode,
        fallback,
        meteringPolicy,
        auditPolicy,
        metadata,
        createdBy,
        createdAt,
        updatedAt,
      ] = args
      this.scenes.set(String(id), {
        id: String(id),
        display_name: String(displayName),
        owner: String(owner),
        owner_scope: String(ownerScope),
        owner_id: ownerId == null ? null : String(ownerId),
        status: String(status),
        required_capabilities: String(requiredCapabilities),
        strategy_mode: String(strategyMode),
        fallback: String(fallback),
        metering_policy: meteringPolicy == null ? null : String(meteringPolicy),
        audit_policy: auditPolicy == null ? null : String(auditPolicy),
        metadata: metadata == null ? null : String(metadata),
        created_by: String(createdBy),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO scene_strategy_bindings')) {
      const [id, sceneId, providerId, capability, priority, weight, status, constraintsJson, metadata, createdAt, updatedAt] = args
      this.bindings.set(String(id), {
        id: String(id),
        scene_id: String(sceneId),
        provider_id: String(providerId),
        capability: String(capability),
        priority: Number(priority),
        weight: weight == null ? null : Number(weight),
        status: String(status),
        constraints_json: constraintsJson == null ? null : String(constraintsJson),
        metadata: metadata == null ? null : String(metadata),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE scene_registry')) {
      const [
        displayName,
        owner,
        ownerScope,
        ownerId,
        status,
        requiredCapabilities,
        strategyMode,
        fallback,
        meteringPolicy,
        auditPolicy,
        metadata,
        updatedAt,
        id,
      ] = args
      const existing = this.scenes.get(String(id))
      if (!existing)
        return { meta: { changes: 0 } }
      this.scenes.set(String(id), {
        ...existing,
        display_name: String(displayName),
        owner: String(owner),
        owner_scope: String(ownerScope),
        owner_id: ownerId == null ? null : String(ownerId),
        status: String(status),
        required_capabilities: String(requiredCapabilities),
        strategy_mode: String(strategyMode),
        fallback: String(fallback),
        metering_policy: meteringPolicy == null ? null : String(meteringPolicy),
        audit_policy: auditPolicy == null ? null : String(auditPolicy),
        metadata: metadata == null ? null : String(metadata),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('DELETE FROM scene_strategy_bindings')) {
      const sceneId = String(args[0])
      for (const [id, row] of [...this.bindings.entries()]) {
        if (row.scene_id === sceneId)
          this.bindings.delete(id)
      }
      return { meta: { changes: 1 } }
    }

    if (sql.includes('DELETE FROM scene_registry')) {
      this.scenes.delete(String(args[0]))
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('FROM scene_registry') && sql.includes('WHERE id = ?')) {
      return this.scenes.get(String(args[0])) ?? null
    }
    return null
  }

  all(sql: string, args: any[]) {
    if (sql.includes('FROM scene_registry')) {
      return this.filterScenes(sql, args)
    }

    if (sql.includes('FROM scene_strategy_bindings')) {
      return this.filterBindings(sql, args)
    }

    return []
  }

  private filterScenes(sql: string, args: any[]) {
    const filterCandidates: Array<[string, keyof SceneRow]> = [
      ['owner = ?', 'owner'],
      ['owner_scope = ?', 'owner_scope'],
      ['status = ?', 'status'],
    ]
    const filters = filterCandidates.filter(([fragment]) => sql.includes(fragment))

    return [...this.scenes.values()]
      .filter(row => filters.every(([, column], index) => String(row[column]) === String(args[index])))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  private filterBindings(sql: string, args: any[]) {
    let rows = [...this.bindings.values()]

    if (sql.includes('scene_id IN')) {
      const sceneIds = new Set(args.map(String))
      rows = rows.filter(row => sceneIds.has(row.scene_id))
    }

    return rows.sort((a, b) => {
      if (a.priority !== b.priority)
        return a.priority - b.priority
      return a.capability.localeCompare(b.capability)
    })
  }
}

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
  getQuery: vi.fn(),
  getRouterParam: vi.fn(),
}))

const state = vi.hoisted(() => ({
  db: null as MockD1Database | null,
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: h3Mocks.readBody,
    getQuery: h3Mocks.getQuery,
    getRouterParam: h3Mocks.getRouterParam,
  }
})

vi.mock('../../../utils/auth', () => authMocks)
vi.mock('../../../utils/cloudflare', () => ({
  readCloudflareBindings: () => state.db ? { DB: state.db } : undefined,
}))

let createSceneHandler: (event: any) => Promise<any>
let listScenesHandler: (event: any) => Promise<any>
let patchSceneHandler: (event: any) => Promise<any>
let deleteSceneHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  createSceneHandler = (await import('./scenes.post')).default as (event: any) => Promise<any>
  listScenesHandler = (await import('./scenes.get')).default as (event: any) => Promise<any>
  patchSceneHandler = (await import('./scenes/[id].patch')).default as (event: any) => Promise<any>
  deleteSceneHandler = (await import('./scenes/[id].delete')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/dashboard/provider-registry/scenes',
    node: { req: { url: '/api/dashboard/provider-registry/scenes' } },
    context: { params: {} },
  }
}

function screenshotTranslateSceneBody() {
  return {
    id: 'corebox.screenshot.translate',
    displayName: 'CoreBox Screenshot Translate',
    owner: 'core-app',
    ownerScope: 'system',
    status: 'enabled',
    requiredCapabilities: ['image.translate.e2e'],
    strategyMode: 'priority',
    fallback: 'enabled',
    meteringPolicy: { usage: ['image'] },
    auditPolicy: { persistInput: false, persistOutput: false },
    bindings: [
      {
        providerId: 'prv_tencent_cloud_mt',
        capability: 'image.translate.e2e',
        priority: 10,
        constraints: { maxImageBytes: 5242880 },
      },
    ],
  }
}

describe('/api/dashboard/provider-registry/scenes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.db = new MockD1Database()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
    h3Mocks.getQuery.mockReturnValue({})
    h3Mocks.getRouterParam.mockReturnValue('')
  })

  it('管理员可以创建截图翻译 scene 与 provider capability binding', async () => {
    h3Mocks.readBody.mockResolvedValue(screenshotTranslateSceneBody())

    const result = await createSceneHandler(makeEvent())

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(result.scene).toMatchObject({
      id: 'corebox.screenshot.translate',
      owner: 'core-app',
      requiredCapabilities: ['image.translate.e2e'],
      strategyMode: 'priority',
      fallback: 'enabled',
      bindings: [
        expect.objectContaining({
          providerId: 'prv_tencent_cloud_mt',
          capability: 'image.translate.e2e',
          priority: 10,
        }),
      ],
    })
    expect(result.scene.auditPolicy).toMatchObject({ persistInput: false })
  })

  it('列表接口支持按 owner 查询并返回 bindings', async () => {
    h3Mocks.readBody.mockResolvedValue(screenshotTranslateSceneBody())
    await createSceneHandler(makeEvent())

    h3Mocks.getQuery.mockReturnValue({ owner: 'core-app' })
    const result = await listScenesHandler(makeEvent())

    expect(result.scenes).toHaveLength(1)
    expect(result.scenes[0]).toMatchObject({
      id: 'corebox.screenshot.translate',
      bindings: [
        expect.objectContaining({ capability: 'image.translate.e2e' }),
      ],
    })
  })

  it('拒绝重复 provider capability binding', async () => {
    h3Mocks.readBody.mockResolvedValue({
      ...screenshotTranslateSceneBody(),
      bindings: [
        {
          providerId: 'prv_tencent_cloud_mt',
          capability: 'image.translate.e2e',
        },
        {
          providerId: 'prv_tencent_cloud_mt',
          capability: 'image.translate.e2e',
        },
      ],
    })

    await expect(createSceneHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('duplicated'),
    })
  })

  it('可以更新 strategy 与 bindings', async () => {
    h3Mocks.readBody.mockResolvedValue(screenshotTranslateSceneBody())
    await createSceneHandler(makeEvent())

    h3Mocks.getRouterParam.mockReturnValue('corebox.screenshot.translate')
    h3Mocks.readBody.mockResolvedValue({
      strategyMode: 'balanced',
      requiredCapabilities: ['vision.ocr', 'text.translate', 'overlay.render'],
      bindings: [
        {
          providerId: 'prv_tencent_cloud_mt',
          capability: 'text.translate',
          priority: 20,
        },
        {
          providerId: 'prv_local_overlay',
          capability: 'overlay.render',
          priority: 30,
        },
      ],
    })

    const result = await patchSceneHandler(makeEvent())

    expect(result.scene).toMatchObject({
      id: 'corebox.screenshot.translate',
      strategyMode: 'balanced',
      requiredCapabilities: ['vision.ocr', 'text.translate', 'overlay.render'],
    })
    expect(result.scene.bindings.map((binding: any) => binding.capability)).toEqual([
      'text.translate',
      'overlay.render',
    ])
  })

  it('删除 scene 时同步删除 bindings', async () => {
    h3Mocks.readBody.mockResolvedValue(screenshotTranslateSceneBody())
    await createSceneHandler(makeEvent())

    h3Mocks.getRouterParam.mockReturnValue('corebox.screenshot.translate')
    const deleted = await deleteSceneHandler(makeEvent())
    const listed = await listScenesHandler(makeEvent())

    expect(deleted).toEqual({ success: true })
    expect(listed.scenes).toEqual([])
    expect(state.db?.bindings.size).toBe(0)
  })
})
