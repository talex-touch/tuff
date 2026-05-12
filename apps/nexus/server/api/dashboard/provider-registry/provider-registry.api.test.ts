import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MockD1Database,
  makeProviderRegistryEvent,
  tencentTranslateProviderBody,
} from './provider-registry-test-utils'

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

const healthMocks = vi.hoisted(() => ({
  recordProviderHealthCheck: vi.fn(),
}))

const intelligenceHealthMocks = vi.hoisted(() => ({
  checkIntelligenceProviderRegistryMirror: vi.fn(),
  isIntelligenceProviderRegistryMirror: vi.fn((provider: any) => provider.metadata?.source === 'intelligence'),
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
vi.mock('../../../utils/providerHealthStore', () => healthMocks)
vi.mock('../../../utils/intelligenceProviderHealthCheck', () => intelligenceHealthMocks)
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
let createCapabilityHandler: (event: any) => Promise<any>
let patchCapabilityHandler: (event: any) => Promise<any>
let deleteCapabilityHandler: (event: any) => Promise<any>
let tencentProviderUtils: typeof import('../../../utils/tencentMachineTranslationProvider')

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  createProviderHandler = (await import('./providers.post')).default as (event: any) => Promise<any>
  storeCredentialHandler = (await import('./credentials.post')).default as (event: any) => Promise<any>
  checkProviderHandler = (await import('./providers/[id]/check.post')).default as (event: any) => Promise<any>
  listProvidersHandler = (await import('./providers.get')).default as (event: any) => Promise<any>
  patchProviderHandler = (await import('./providers/[id].patch')).default as (event: any) => Promise<any>
  deleteProviderHandler = (await import('./providers/[id].delete')).default as (event: any) => Promise<any>
  listCapabilitiesHandler = (await import('./capabilities.get')).default as (event: any) => Promise<any>
  createCapabilityHandler = (await import('./providers/[id]/capabilities.post')).default as (event: any) => Promise<any>
  patchCapabilityHandler = (await import('./providers/[id]/capabilities/[capabilityId].patch')).default as (event: any) => Promise<any>
  deleteCapabilityHandler = (await import('./providers/[id]/capabilities/[capabilityId].delete')).default as (event: any) => Promise<any>
  tencentProviderUtils = await import('../../../utils/tencentMachineTranslationProvider')
})

const makeEvent = makeProviderRegistryEvent

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
    healthMocks.recordProviderHealthCheck.mockResolvedValue(null)
    intelligenceHealthMocks.isIntelligenceProviderRegistryMirror.mockImplementation(
      (provider: any) => provider.metadata?.source === 'intelligence',
    )
    intelligenceHealthMocks.checkIntelligenceProviderRegistryMirror.mockResolvedValue({
      success: true,
      providerId: 'prv_ai_registry',
      capability: 'chat.completion',
      latency: 33,
      endpoint: 'langchain:openai:chat',
      requestId: 'trace_ai_probe',
      message: 'Probe completed.',
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

  it('Provider CRUD 只接受 secure://providers/<slug> authRef', async () => {
    h3Mocks.readBody.mockResolvedValue({
      ...tencentTranslateProviderBody(),
      authRef: 'secure://other/tencent-cloud-mt-main',
    })

    await expect(createProviderHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('secure://providers'),
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
    const originalSecureStoreKey = process.env.PROVIDER_REGISTRY_SECURE_STORE_KEY
    try {
      process.env.NODE_ENV = 'production'
      delete process.env.PROVIDER_REGISTRY_SECURE_STORE_KEY
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
    }
    finally {
      process.env.NODE_ENV = originalNodeEnv
      if (originalSecureStoreKey == null)
        delete process.env.PROVIDER_REGISTRY_SECURE_STORE_KEY
      else
        process.env.PROVIDER_REGISTRY_SECURE_STORE_KEY = originalSecureStoreKey
    }
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
      metadata: {
        prdScene: 'screenshot-translation',
        owner: 'ops',
      },
      capabilities: [
        {
          capability: 'text.translate',
          schemaRef: 'nexus://schemas/provider/text-translate.v1',
          metering: {
            unit: 'character',
            unitCost: 0.01,
          },
          constraints: {
            maxTextLength: 3000,
          },
          metadata: {
            qualityTier: 'standard',
          },
        },
      ],
    })

    const result = await patchProviderHandler(makeEvent())

    expect(result.provider).toMatchObject({
      id: created.provider.id,
      status: 'degraded',
      metadata: {
        prdScene: 'screenshot-translation',
        owner: 'ops',
      },
      capabilities: [
        {
          capability: 'text.translate',
          metering: {
            unit: 'character',
            unitCost: 0.01,
          },
          constraints: {
            maxTextLength: 3000,
          },
          metadata: {
            qualityTier: 'standard',
          },
        },
      ],
    })
    expect(result.provider.capabilities).toHaveLength(1)
  })

  it('可以通过独立 API 新增 provider capability', async () => {
    h3Mocks.readBody.mockResolvedValue(tencentTranslateProviderBody())
    const created = await createProviderHandler(makeEvent())

    h3Mocks.getRouterParam.mockImplementation((_event, name) => {
      if (name === 'id')
        return created.provider.id
      return ''
    })
    h3Mocks.readBody.mockResolvedValue({
      capability: 'vision.ocr',
      schemaRef: 'nexus://schemas/provider/vision-ocr.v1',
      metering: { unit: 'image' },
      constraints: { maxImageBytes: 5_242_880 },
      metadata: { providerModel: 'ocr-v1' },
    })

    const result = await createCapabilityHandler(makeEvent())
    h3Mocks.getQuery.mockReturnValue({ providerId: created.provider.id })
    const listed = await listCapabilitiesHandler(makeEvent())

    expect(result.capability).toMatchObject({
      providerId: created.provider.id,
      capability: 'vision.ocr',
      schemaRef: 'nexus://schemas/provider/vision-ocr.v1',
      metering: { unit: 'image' },
      constraints: { maxImageBytes: 5_242_880 },
      metadata: { providerModel: 'ocr-v1' },
    })
    expect(listed.capabilities.map((item: any) => item.capability)).toEqual([
      'image.translate',
      'image.translate.e2e',
      'text.translate',
      'vision.ocr',
    ])
  })

  it('独立 capability API 可以局部更新 schemaRef、metering、constraints 与 metadata', async () => {
    h3Mocks.readBody.mockResolvedValue(tencentTranslateProviderBody())
    const created = await createProviderHandler(makeEvent())
    const textCapability = created.provider.capabilities.find((item: any) => item.capability === 'text.translate')

    h3Mocks.getRouterParam.mockImplementation((_event, name) => {
      if (name === 'id')
        return created.provider.id
      if (name === 'capabilityId')
        return textCapability.id
      return ''
    })
    h3Mocks.readBody.mockResolvedValue({
      schemaRef: 'nexus://schemas/provider/text-translate.v2',
      metering: {
        unit: 'character',
        unitCost: 0.02,
      },
      constraints: {
        maxTextLength: 8000,
        sourceLanguages: ['auto', 'en'],
      },
      metadata: {
        qualityTier: 'premium',
      },
    })

    const result = await patchCapabilityHandler(makeEvent())

    expect(result.capability).toMatchObject({
      id: textCapability.id,
      providerId: created.provider.id,
      capability: 'text.translate',
      schemaRef: 'nexus://schemas/provider/text-translate.v2',
      metering: {
        unit: 'character',
        unitCost: 0.02,
      },
      constraints: {
        maxTextLength: 8000,
        sourceLanguages: ['auto', 'en'],
      },
      metadata: {
        qualityTier: 'premium',
      },
    })
  })

  it('独立 capability API 可以删除单个 capability 而不影响同 provider 其他能力', async () => {
    h3Mocks.readBody.mockResolvedValue(tencentTranslateProviderBody())
    const created = await createProviderHandler(makeEvent())
    const imageCapability = created.provider.capabilities.find((item: any) => item.capability === 'image.translate')

    h3Mocks.getRouterParam.mockImplementation((_event, name) => {
      if (name === 'id')
        return created.provider.id
      if (name === 'capabilityId')
        return imageCapability.id
      return ''
    })

    const deleted = await deleteCapabilityHandler(makeEvent())
    h3Mocks.getQuery.mockReturnValue({ providerId: created.provider.id })
    const listed = await listCapabilitiesHandler(makeEvent())

    expect(deleted).toEqual({ success: true })
    expect(listed.capabilities.map((item: any) => item.capability)).toEqual([
      'image.translate.e2e',
      'text.translate',
    ])
  })

  it('独立 capability API 对不存在 provider 或 capability 返回 404', async () => {
    h3Mocks.getRouterParam.mockImplementation((_event, name) => {
      if (name === 'id')
        return 'missing-provider'
      return ''
    })
    h3Mocks.readBody.mockResolvedValue({
      capability: 'vision.ocr',
    })

    await expect(createCapabilityHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Provider registry entry not found.',
    })

    h3Mocks.readBody.mockResolvedValue(tencentTranslateProviderBody())
    const created = await createProviderHandler(makeEvent())
    h3Mocks.getRouterParam.mockImplementation((_event, name) => {
      if (name === 'id')
        return created.provider.id
      if (name === 'capabilityId')
        return 'missing-capability'
      return ''
    })
    h3Mocks.readBody.mockResolvedValue({ metadata: { qualityTier: 'premium' } })

    await expect(patchCapabilityHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Provider capability not found.',
    })
    await expect(deleteCapabilityHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Provider capability not found.',
    })
  })

  it('独立 capability API 拒绝重复 capability', async () => {
    h3Mocks.readBody.mockResolvedValue(tencentTranslateProviderBody())
    const created = await createProviderHandler(makeEvent())
    const imageCapability = created.provider.capabilities.find((item: any) => item.capability === 'image.translate')

    h3Mocks.getRouterParam.mockImplementation((_event, name) => {
      if (name === 'id')
        return created.provider.id
      if (name === 'capabilityId')
        return imageCapability.id
      return ''
    })
    h3Mocks.readBody.mockResolvedValue({
      capability: 'text.translate',
    })

    await expect(patchCapabilityHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Provider capability already exists.',
    })

    h3Mocks.readBody.mockResolvedValue({
      capability: 'text.translate',
      schemaRef: 'nexus://schemas/provider/text-translate.v1',
    })

    await expect(createCapabilityHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Provider capability already exists.',
    })
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
    expect(healthMocks.recordProviderHealthCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: created.provider.id }),
      expect.objectContaining({
        success: true,
        providerId: created.provider.id,
        capability: 'text.translate',
        requestId: 'req-1',
      }),
    )
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

  it('生产环境缺少 secure-store master key 时 provider check 拒绝解析凭证', async () => {
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

    const originalNodeEnv = process.env.NODE_ENV
    const originalSecureStoreKey = process.env.PROVIDER_REGISTRY_SECURE_STORE_KEY
    try {
      process.env.NODE_ENV = 'production'
      delete process.env.PROVIDER_REGISTRY_SECURE_STORE_KEY
      importsMocks.useRuntimeConfig.mockReturnValue({
        providerRegistry: {},
      })
      h3Mocks.getRouterParam.mockReturnValue(created.provider.id)
      h3Mocks.readBody.mockResolvedValue({ capability: 'text.translate' })

      await expect(checkProviderHandler(makeEvent())).rejects.toMatchObject({
        statusCode: 500,
        statusMessage: expect.stringContaining('secure store key'),
      })
      expect(networkMocks.request).not.toHaveBeenCalled()
    }
    finally {
      process.env.NODE_ENV = originalNodeEnv
      if (originalSecureStoreKey == null)
        delete process.env.PROVIDER_REGISTRY_SECURE_STORE_KEY
      else
        process.env.PROVIDER_REGISTRY_SECURE_STORE_KEY = originalSecureStoreKey
    }
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
        code: 'AUTH_REQUIRED',
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

  it('AI registry mirror provider check 复用 intelligence provider 探活并记录 health', async () => {
    h3Mocks.readBody.mockResolvedValue({
      name: 'ip_ai_provider_1',
      displayName: 'OpenAI Main',
      vendor: 'openai',
      status: 'enabled',
      authType: 'api_key',
      authRef: 'secure://providers/intelligence-ip_ai_provider_1',
      ownerScope: 'user',
      ownerId: 'admin_1',
      endpoint: 'https://api.openai.com/v1',
      metadata: {
        source: 'intelligence',
        intelligenceProviderId: 'ip_ai_provider_1',
        intelligenceType: 'openai',
      },
      capabilities: [
        {
          capability: 'chat.completion',
          schemaRef: 'nexus://schemas/provider/chat-completion.v1',
          metering: { unit: 'token' },
        },
      ],
    })
    const created = await createProviderHandler(makeEvent())

    h3Mocks.getRouterParam.mockReturnValue(created.provider.id)
    h3Mocks.readBody.mockResolvedValue({
      capability: 'chat.completion',
      model: 'gpt-4.1-mini',
      prompt: 'ping',
      timeoutMs: 7000,
    })
    intelligenceHealthMocks.checkIntelligenceProviderRegistryMirror.mockResolvedValueOnce({
      success: true,
      providerId: created.provider.id,
      capability: 'chat.completion',
      latency: 33,
      endpoint: 'langchain:openai:chat',
      requestId: 'trace_ai_probe',
      message: 'Probe completed.',
    })

    const result = await checkProviderHandler(makeEvent())

    expect(intelligenceHealthMocks.checkIntelligenceProviderRegistryMirror).toHaveBeenCalledWith(
      expect.anything(),
      'admin_1',
      expect.objectContaining({
        id: created.provider.id,
        metadata: expect.objectContaining({
          source: 'intelligence',
          intelligenceProviderId: 'ip_ai_provider_1',
        }),
      }),
      {
        capability: 'chat.completion',
        model: 'gpt-4.1-mini',
        prompt: 'ping',
        timeoutMs: 7000,
      },
    )
    expect(result).toMatchObject({
      success: true,
      providerId: created.provider.id,
      capability: 'chat.completion',
      endpoint: 'langchain:openai:chat',
      requestId: 'trace_ai_probe',
    })
    expect(healthMocks.recordProviderHealthCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: created.provider.id, vendor: 'openai' }),
      expect.objectContaining({
        success: true,
        providerId: created.provider.id,
        capability: 'chat.completion',
      }),
    )
  })

  it('AI registry mirror provider check 支持 vision.ocr probe 输入透传', async () => {
    h3Mocks.readBody.mockResolvedValue({
      name: 'ip_ai_vision_provider',
      displayName: 'OpenAI Vision',
      vendor: 'openai',
      status: 'enabled',
      authType: 'api_key',
      authRef: 'secure://providers/intelligence-ip_ai_vision_provider',
      ownerScope: 'user',
      ownerId: 'admin_1',
      endpoint: 'https://api.openai.com/v1',
      metadata: {
        source: 'intelligence',
        intelligenceProviderId: 'ip_ai_vision_provider',
        intelligenceType: 'openai',
      },
      capabilities: [
        {
          capability: 'vision.ocr',
          schemaRef: 'nexus://schemas/provider/vision-ocr.v1',
          metering: { unit: 'image' },
        },
      ],
    })
    const created = await createProviderHandler(makeEvent())

    h3Mocks.getRouterParam.mockReturnValue(created.provider.id)
    h3Mocks.readBody.mockResolvedValue({
      capability: 'vision.ocr',
      imageDataUrl: 'data:image/png;base64,abc123',
      language: 'en',
      prompt: 'ocr probe',
      timeoutMs: 7000,
    })
    intelligenceHealthMocks.checkIntelligenceProviderRegistryMirror.mockResolvedValueOnce({
      success: true,
      providerId: created.provider.id,
      capability: 'vision.ocr',
      latency: 41,
      endpoint: 'https://api.openai.com/v1',
      requestId: 'req_ocr_probe',
      message: 'Intelligence vision OCR check succeeded.',
    })

    const result = await checkProviderHandler(makeEvent())

    expect(intelligenceHealthMocks.checkIntelligenceProviderRegistryMirror).toHaveBeenCalledWith(
      expect.anything(),
      'admin_1',
      expect.objectContaining({ id: created.provider.id }),
      {
        capability: 'vision.ocr',
        model: undefined,
        prompt: 'ocr probe',
        imageDataUrl: 'data:image/png;base64,abc123',
        imageBase64: undefined,
        language: 'en',
        timeoutMs: 7000,
      },
    )
    expect(result).toMatchObject({
      success: true,
      providerId: created.provider.id,
      capability: 'vision.ocr',
      requestId: 'req_ocr_probe',
    })
    expect(healthMocks.recordProviderHealthCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: created.provider.id, vendor: 'openai' }),
      expect.objectContaining({
        capability: 'vision.ocr',
        requestId: 'req_ocr_probe',
      }),
    )
  })

  it('腾讯云图片翻译 adapter 将标准 payload 转换为 ImageTranslateLLM 请求', async () => {
    networkMocks.request.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        Response: {
          Data: 'translated-image-base64',
          Source: 'auto',
          Target: 'zh',
          SourceText: 'hello',
          TargetText: '你好',
          Angle: 0,
          TransDetails: [{ source: 'hello', target: '你好' }],
          RequestId: 'req-image-translate',
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

    const result = await tencentProviderUtils.invokeTencentImageTranslate(makeEvent() as any, created.provider, {
      imageBase64: 'source-image-base64',
      targetLang: 'zh',
    }, 'image.translate.e2e')
    const request = networkMocks.request.mock.calls.at(-1)?.[0]

    expect(result).toMatchObject({
      translatedImageBase64: 'translated-image-base64',
      sourceLang: 'auto',
      targetLang: 'zh',
      sourceText: 'hello',
      targetText: '你好',
      providerRequestId: 'req-image-translate',
      usage: {
        unit: 'image',
        quantity: 1,
        billable: true,
        estimated: true,
      },
    })
    expect(JSON.stringify(result)).not.toContain('secret-key-unit-test')
    expect(request).toMatchObject({
      method: 'POST',
      url: 'https://tmt.tencentcloudapi.com',
      headers: expect.objectContaining({
        Authorization: expect.stringContaining('TC3-HMAC-SHA256'),
        'X-TC-Action': 'ImageTranslateLLM',
        'X-TC-Version': '2018-03-21',
        'X-TC-Region': 'ap-shanghai',
      }),
    })
    expect(request.body).toContain('"Data":"source-image-base64"')
    expect(request.body).toContain('"Target":"zh"')
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
