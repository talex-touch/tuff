import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface ProviderRow {
  id: string
  name: string
  display_name: string
  vendor: string
  status: string
  auth_type: string
  auth_ref: string | null
  owner_scope: string
  owner_id: string | null
  description: string | null
  endpoint: string | null
  region: string | null
  metadata: string | null
  created_by: string
  created_at: string
  updated_at: string
}

interface CapabilityRow {
  id: string
  provider_id: string
  capability: string
  schema_ref: string | null
  metering: string | null
  constraints_json: string | null
  metadata: string | null
  created_at: string
  updated_at: string
}

interface CredentialRow {
  auth_ref: string
  purpose: string
  encrypted_value: string
  created_by: string
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
  providers = new Map<string, ProviderRow>()
  capabilities = new Map<string, CapabilityRow>()
  credentials = new Map<string, CredentialRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
      return { meta: { changes: 0 } }
    }

    if (sql.includes('INSERT INTO provider_registry')) {
      const [
        id,
        name,
        displayName,
        vendor,
        status,
        authType,
        authRef,
        ownerScope,
        ownerId,
        description,
        endpoint,
        region,
        metadata,
        createdBy,
        createdAt,
        updatedAt,
      ] = args
      this.providers.set(String(id), {
        id: String(id),
        name: String(name),
        display_name: String(displayName),
        vendor: String(vendor),
        status: String(status),
        auth_type: String(authType),
        auth_ref: authRef == null ? null : String(authRef),
        owner_scope: String(ownerScope),
        owner_id: ownerId == null ? null : String(ownerId),
        description: description == null ? null : String(description),
        endpoint: endpoint == null ? null : String(endpoint),
        region: region == null ? null : String(region),
        metadata: metadata == null ? null : String(metadata),
        created_by: String(createdBy),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO provider_capabilities')) {
      const [id, providerId, capability, schemaRef, metering, constraintsJson, metadata, createdAt, updatedAt] = args
      this.capabilities.set(String(id), {
        id: String(id),
        provider_id: String(providerId),
        capability: String(capability),
        schema_ref: schemaRef == null ? null : String(schemaRef),
        metering: metering == null ? null : String(metering),
        constraints_json: constraintsJson == null ? null : String(constraintsJson),
        metadata: metadata == null ? null : String(metadata),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO provider_secure_store')) {
      const [authRef, purpose, encryptedValue, createdBy, createdAt, updatedAt] = args
      this.credentials.set(`${String(authRef)}:${String(purpose)}`, {
        auth_ref: String(authRef),
        purpose: String(purpose),
        encrypted_value: String(encryptedValue),
        created_by: String(createdBy),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE provider_registry')) {
      const [
        name,
        displayName,
        vendor,
        status,
        authType,
        authRef,
        ownerScope,
        ownerId,
        description,
        endpoint,
        region,
        metadata,
        updatedAt,
        id,
      ] = args
      const existing = this.providers.get(String(id))
      if (!existing)
        return { meta: { changes: 0 } }
      this.providers.set(String(id), {
        ...existing,
        name: String(name),
        display_name: String(displayName),
        vendor: String(vendor),
        status: String(status),
        auth_type: String(authType),
        auth_ref: authRef == null ? null : String(authRef),
        owner_scope: String(ownerScope),
        owner_id: ownerId == null ? null : String(ownerId),
        description: description == null ? null : String(description),
        endpoint: endpoint == null ? null : String(endpoint),
        region: region == null ? null : String(region),
        metadata: metadata == null ? null : String(metadata),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('DELETE FROM provider_capabilities')) {
      const providerId = String(args[0])
      for (const [id, row] of [...this.capabilities.entries()]) {
        if (row.provider_id === providerId)
          this.capabilities.delete(id)
      }
      return { meta: { changes: 1 } }
    }

    if (sql.includes('DELETE FROM provider_registry')) {
      const id = String(args[0])
      this.providers.delete(id)
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('FROM provider_registry') && sql.includes('WHERE id = ?')) {
      return this.providers.get(String(args[0])) ?? null
    }
    if (sql.includes('FROM provider_secure_store')) {
      return this.credentials.get(`${String(args[0])}:${String(args[1])}`) ?? null
    }
    return null
  }

  all(sql: string, args: any[]) {
    if (sql.includes('FROM provider_registry')) {
      return this.filterProviders(sql, args)
    }

    if (sql.includes('FROM provider_capabilities')) {
      return this.filterCapabilities(sql, args)
    }

    return []
  }

  private filterProviders(sql: string, args: any[]) {
    const filterCandidates: Array<[string, keyof ProviderRow]> = [
      ['vendor = ?', 'vendor'],
      ['status = ?', 'status'],
      ['owner_scope = ?', 'owner_scope'],
    ]
    const filters = filterCandidates.filter(([fragment]) => sql.includes(fragment))

    return [...this.providers.values()]
      .filter(row => filters.every(([, column], index) => String((row as any)[column]) === String(args[index])))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  private filterCapabilities(sql: string, args: any[]) {
    let rows = [...this.capabilities.values()]

    if (sql.includes('provider_id IN')) {
      const providerIds = new Set(args.map(String))
      rows = rows.filter(row => providerIds.has(row.provider_id))
    }

    if (sql.includes('c.provider_id = ?')) {
      rows = rows.filter(row => row.provider_id === String(args.shift()))
    }

    if (sql.includes('c.capability = ?')) {
      rows = rows.filter(row => row.capability === String(args.shift()))
    }

    if (sql.includes('p.vendor = ?')) {
      const vendor = String(args.shift())
      const providerIds = new Set([...this.providers.values()].filter(row => row.vendor === vendor).map(row => row.id))
      rows = rows.filter(row => providerIds.has(row.provider_id))
    }

    return rows.sort((a, b) => a.capability.localeCompare(b.capability))
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

const importsMocks = vi.hoisted(() => ({
  useRuntimeConfig: vi.fn(() => ({
    providerRegistry: {
      secureStoreKey: 'unit-test-provider-registry-key',
    },
  })),
}))

const networkMocks = vi.hoisted(() => ({
  request: vi.fn(),
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
vi.mock('#imports', () => importsMocks)
vi.mock('@talex-touch/utils/network', () => ({
  networkClient: {
    request: networkMocks.request,
  },
}))

let createProviderHandler: (event: any) => Promise<any>
let storeCredentialHandler: (event: any) => Promise<any>
let checkProviderHandler: (event: any) => Promise<any>
let listProvidersHandler: (event: any) => Promise<any>
let patchProviderHandler: (event: any) => Promise<any>
let deleteProviderHandler: (event: any) => Promise<any>
let listCapabilitiesHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  createProviderHandler = (await import('./providers.post')).default as (event: any) => Promise<any>
  storeCredentialHandler = (await import('./credentials.post')).default as (event: any) => Promise<any>
  checkProviderHandler = (await import('./providers/[id]/check.post')).default as (event: any) => Promise<any>
  listProvidersHandler = (await import('./providers.get')).default as (event: any) => Promise<any>
  patchProviderHandler = (await import('./providers/[id].patch')).default as (event: any) => Promise<any>
  deleteProviderHandler = (await import('./providers/[id].delete')).default as (event: any) => Promise<any>
  listCapabilitiesHandler = (await import('./capabilities.get')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/dashboard/provider-registry/providers',
    node: { req: { url: '/api/dashboard/provider-registry/providers' } },
    context: { params: {} },
  }
}

function tencentTranslateProviderBody() {
  return {
    name: 'tencent-cloud-mt-main',
    displayName: 'Tencent Cloud Machine Translation',
    vendor: 'tencent-cloud',
    status: 'enabled',
    authType: 'secret_pair',
    authRef: 'secure://providers/tencent-cloud-mt-main',
    ownerScope: 'system',
    endpoint: 'https://tmt.tencentcloudapi.com',
    region: 'ap-shanghai',
    metadata: {
      prdScene: 'screenshot-translation',
    },
    capabilities: [
      {
        capability: 'text.translate',
        schemaRef: 'nexus://schemas/provider/text-translate.v1',
        metering: { unit: 'character' },
        constraints: { maxTextLength: 5000 },
      },
      {
        capability: 'image.translate',
        schemaRef: 'nexus://schemas/provider/image-translate.v1',
        metering: { unit: 'image' },
      },
      {
        capability: 'image.translate.e2e',
        schemaRef: 'nexus://schemas/provider/image-translate-e2e.v1',
      },
    ],
  }
}

describe('/api/dashboard/provider-registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.db = new MockD1Database()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
    importsMocks.useRuntimeConfig.mockReturnValue({
      providerRegistry: {
        secureStoreKey: 'unit-test-provider-registry-key',
      },
    })
    networkMocks.request.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        Response: {
          TargetText: '你好',
          RequestId: 'req-1',
        },
      },
      url: 'https://tmt.tencentcloudapi.com',
      ok: true,
    })
    h3Mocks.getQuery.mockReturnValue({})
    h3Mocks.getRouterParam.mockReturnValue('')
  })

  it('管理员可以创建腾讯云机器翻译 provider，且只保存 authRef 与 capabilities', async () => {
    h3Mocks.readBody.mockResolvedValue(tencentTranslateProviderBody())

    const result = await createProviderHandler(makeEvent())

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(result.provider).toMatchObject({
      name: 'tencent-cloud-mt-main',
      vendor: 'tencent-cloud',
      status: 'enabled',
      authType: 'secret_pair',
      authRef: 'secure://providers/tencent-cloud-mt-main',
      capabilities: expect.arrayContaining([
        expect.objectContaining({ capability: 'image.translate.e2e' }),
        expect.objectContaining({ capability: 'image.translate' }),
        expect.objectContaining({ capability: 'text.translate' }),
      ]),
    })
    expect(result.provider.capabilities).toHaveLength(3)
    expect(JSON.stringify(state.db?.providers)).not.toContain('secretKey')
    expect(JSON.stringify(state.db?.providers)).not.toContain('apiKey')
  })

  it('拒绝明文密钥字段', async () => {
    h3Mocks.readBody.mockResolvedValue({
      ...tencentTranslateProviderBody(),
      secretKey: 'plain-secret',
    })

    await expect(createProviderHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('authRef'),
    })

    expect(state.db?.providers.size).toBe(0)
  })

  it('凭证绑定接口将 secret_pair 写入 D1 密文 secure store', async () => {
    h3Mocks.readBody.mockResolvedValue({
      authRef: 'secure://providers/tencent-cloud-mt-main',
      authType: 'secret_pair',
      credentials: {
        secretId: 'AKID-unit-test',
        secretKey: 'secret-key-unit-test',
      },
    })

    const result = await storeCredentialHandler(makeEvent())
    const row = [...(state.db?.credentials.values() ?? [])][0]

    expect(result).toMatchObject({
      success: true,
      authRef: 'secure://providers/tencent-cloud-mt-main',
      backend: 'd1-encrypted',
      degraded: false,
    })
    expect(row?.encrypted_value).toContain('A256GCM')
    expect(row?.encrypted_value).not.toContain('AKID-unit-test')
    expect(row?.encrypted_value).not.toContain('secret-key-unit-test')
  })

  it('凭证绑定接口拒绝非法 authRef 与 schema 不匹配', async () => {
    h3Mocks.readBody.mockResolvedValue({
      authRef: 'plain://providers/tencent-cloud-mt-main',
      authType: 'secret_pair',
      credentials: {
        secretId: 'AKID-unit-test',
        secretKey: 'secret-key-unit-test',
      },
    })

    await expect(storeCredentialHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('secure://providers'),
    })

    h3Mocks.readBody.mockResolvedValue({
      authRef: 'secure://providers/tencent-cloud-mt-main',
      authType: 'secret_pair',
      credentials: {
        apiKey: 'wrong-shape',
      },
    })

    await expect(storeCredentialHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('secretId'),
    })
  })

  it('生产环境缺少 secure-store master key 时拒绝绑定', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    importsMocks.useRuntimeConfig.mockReturnValue({
      providerRegistry: {},
    })
    h3Mocks.readBody.mockResolvedValue({
      authRef: 'secure://providers/tencent-cloud-mt-main',
      authType: 'secret_pair',
      credentials: {
        secretId: 'AKID-unit-test',
        secretKey: 'secret-key-unit-test',
      },
    })

    await expect(storeCredentialHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: expect.stringContaining('secure store key'),
    })

    process.env.NODE_ENV = originalNodeEnv
  })

  it('非生产环境缺少 secure-store master key 时允许降级 fallback', async () => {
    importsMocks.useRuntimeConfig.mockReturnValue({
      providerRegistry: {},
    })
    h3Mocks.readBody.mockResolvedValue({
      authRef: 'secure://providers/tencent-cloud-mt-main',
      authType: 'secret_pair',
      credentials: {
        secretId: 'AKID-unit-test',
        secretKey: 'secret-key-unit-test',
      },
    })

    const result = await storeCredentialHandler(makeEvent())

    expect(result).toMatchObject({
      success: true,
      degraded: true,
    })
  })

  it('列表接口返回 provider 与 capabilities', async () => {
    h3Mocks.readBody.mockResolvedValue(tencentTranslateProviderBody())
    await createProviderHandler(makeEvent())

    h3Mocks.getQuery.mockReturnValue({ vendor: 'tencent-cloud' })
    const result = await listProvidersHandler(makeEvent())

    expect(result.providers).toHaveLength(1)
    expect(result.providers[0]).toMatchObject({
      vendor: 'tencent-cloud',
      capabilities: expect.arrayContaining([
        expect.objectContaining({ capability: 'text.translate' }),
        expect.objectContaining({ capability: 'image.translate' }),
      ]),
    })
  })

  it('capabilities 接口支持按 vendor 查询', async () => {
    h3Mocks.readBody.mockResolvedValue(tencentTranslateProviderBody())
    await createProviderHandler(makeEvent())

    h3Mocks.getQuery.mockReturnValue({ vendor: 'tencent-cloud' })
    const result = await listCapabilitiesHandler(makeEvent())

    expect(result.capabilities.map((item: any) => item.capability)).toEqual([
      'image.translate',
      'image.translate.e2e',
      'text.translate',
    ])
  })

  it('可以更新 status 与 capabilities', async () => {
    h3Mocks.readBody.mockResolvedValue(tencentTranslateProviderBody())
    const created = await createProviderHandler(makeEvent())

    h3Mocks.getRouterParam.mockReturnValue(created.provider.id)
    h3Mocks.readBody.mockResolvedValue({
      status: 'degraded',
      capabilities: [
        {
          capability: 'text.translate',
          schemaRef: 'nexus://schemas/provider/text-translate.v1',
        },
      ],
    })

    const result = await patchProviderHandler(makeEvent())

    expect(result.provider).toMatchObject({
      id: created.provider.id,
      status: 'degraded',
      capabilities: [{ capability: 'text.translate' }],
    })
    expect(result.provider.capabilities).toHaveLength(1)
  })

  it('腾讯云机器翻译 provider check 会解析 authRef 并注入 TC3 签名请求', async () => {
    h3Mocks.readBody.mockResolvedValue(tencentTranslateProviderBody())
    const created = await createProviderHandler(makeEvent())

    h3Mocks.readBody.mockResolvedValue({
      authRef: 'secure://providers/tencent-cloud-mt-main',
      authType: 'secret_pair',
      credentials: {
        secretId: 'AKID-unit-test',
        secretKey: 'secret-key-unit-test',
      },
    })
    await storeCredentialHandler(makeEvent())

    h3Mocks.getRouterParam.mockReturnValue(created.provider.id)
    h3Mocks.readBody.mockResolvedValue({ capability: 'text.translate' })

    const result = await checkProviderHandler(makeEvent())
    const request = networkMocks.request.mock.calls.at(-1)?.[0]

    expect(result).toMatchObject({
      success: true,
      providerId: created.provider.id,
      capability: 'text.translate',
      endpoint: 'https://tmt.tencentcloudapi.com',
      requestId: 'req-1',
    })
    expect(JSON.stringify(result)).not.toContain('secret-key-unit-test')
    expect(request).toMatchObject({
      method: 'POST',
      url: 'https://tmt.tencentcloudapi.com',
      headers: expect.objectContaining({
        Authorization: expect.stringContaining('TC3-HMAC-SHA256'),
        'X-TC-Action': 'TextTranslate',
        'X-TC-Version': '2018-03-21',
        'X-TC-Region': 'ap-shanghai',
      }),
    })
    expect(request.headers.Authorization).toContain('/tmt/tc3_request')
    expect(request.body).toContain('"SourceText":"hello"')
  })

  it('腾讯云 provider check 缺失 secure credential 时返回 AUTH_REQUIRED 失败结果', async () => {
    h3Mocks.readBody.mockResolvedValue(tencentTranslateProviderBody())
    const created = await createProviderHandler(makeEvent())

    h3Mocks.getRouterParam.mockReturnValue(created.provider.id)
    h3Mocks.readBody.mockResolvedValue({})

    const result = await checkProviderHandler(makeEvent())

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        code: 'PROVIDER_REQUEST_FAILED',
      }),
    })
    expect(networkMocks.request).not.toHaveBeenCalled()
  })

  it('腾讯云 provider check 会映射供应商错误响应', async () => {
    networkMocks.request.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        Response: {
          RequestId: 'req-error',
          Error: {
            Code: 'AuthFailure.SecretIdNotFound',
            Message: 'secret id not found',
          },
        },
      },
      url: 'https://tmt.tencentcloudapi.com',
      ok: true,
    })
    h3Mocks.readBody.mockResolvedValue(tencentTranslateProviderBody())
    const created = await createProviderHandler(makeEvent())

    h3Mocks.readBody.mockResolvedValue({
      authRef: 'secure://providers/tencent-cloud-mt-main',
      authType: 'secret_pair',
      credentials: {
        secretId: 'AKID-unit-test',
        secretKey: 'secret-key-unit-test',
      },
    })
    await storeCredentialHandler(makeEvent())

    h3Mocks.getRouterParam.mockReturnValue(created.provider.id)
    h3Mocks.readBody.mockResolvedValue({})
    const result = await checkProviderHandler(makeEvent())

    expect(result).toMatchObject({
      success: false,
      requestId: 'req-error',
      error: expect.objectContaining({
        code: 'AuthFailure.SecretIdNotFound',
        message: 'secret id not found',
      }),
    })
  })

  it('删除 provider 时同步删除 capabilities', async () => {
    h3Mocks.readBody.mockResolvedValue(tencentTranslateProviderBody())
    const created = await createProviderHandler(makeEvent())

    h3Mocks.getRouterParam.mockReturnValue(created.provider.id)
    const deleted = await deleteProviderHandler(makeEvent())
    const listed = await listProvidersHandler(makeEvent())
    const capabilities = await listCapabilitiesHandler(makeEvent())

    expect(deleted).toEqual({ success: true })
    expect(listed.providers).toEqual([])
    expect(capabilities.capabilities).toEqual([])
  })
})
