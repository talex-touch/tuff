import type { IntelligenceProviderRecord } from './tuffIntelligenceProviderAdapters'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invokeIntelligenceCapability } from './tuffIntelligenceLabService'

const storeMocks = vi.hoisted(() => ({
  createAudit: vi.fn(),
}))
const registryRuntimeMocks = vi.hoisted(() => ({
  getProviderApiKey: vi.fn(),
  listRegistryRuntimeProviders: vi.fn(),
}))
const langchainMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}))
const usageLedgerMocks = vi.hoisted(() => ({
  recordProviderUsageLedger: vi.fn(),
}))
const creditMocks = vi.hoisted(() => ({
  consumeCredits: vi.fn(),
  releaseConsumedCredits: vi.fn(),
}))

vi.mock('./intelligenceStore', async () => {
  const actual = await vi.importActual<typeof import('./intelligenceStore')>('./intelligenceStore')
  return { ...actual, createAudit: storeMocks.createAudit }
})
vi.mock('./sceneOrchestrator', () => ({
  resolveCapabilitySceneId: (capability: string) => `nexus.intelligence.${capability}`,
  resolveSceneProviderCandidates: async (event: unknown, options: { capability: string, ownerId: string }) => {
    const providers: IntelligenceProviderRecord[] = await registryRuntimeMocks.listRegistryRuntimeProviders(event, options.ownerId)
    const candidates = providers
      .filter(provider => provider.enabled && (provider.capabilities ?? []).includes(options.capability))
      .map(provider => ({
        provider: {
          id: provider.id, name: provider.id, displayName: provider.name, vendor: 'custom', status: 'enabled',
          authType: provider.type === 'local' ? 'none' : 'api_key', authRef: provider.type === 'local' ? null : `secure://providers/${provider.id}`,
          ownerScope: 'system', ownerId: null, description: null, endpoint: provider.baseUrl, region: null,
          metadata: { ...(provider.metadata ?? {}), adapterKey: 'openai-compatible', models: provider.models, defaultModel: provider.defaultModel, intelligenceType: provider.type },
          capabilities: (provider.capabilities ?? []).map(capability => ({ id: `${provider.id}:${capability}`, providerId: provider.id, capability, schemaRef: null, metering: null, constraints: null, metadata: null, createdAt: provider.createdAt, updatedAt: provider.updatedAt })),
          createdBy: provider.userId, createdAt: provider.createdAt, updatedAt: provider.updatedAt,
        },
        binding: { id: `binding:${provider.id}`, sceneId: `nexus.intelligence.${options.capability}`, providerId: provider.id, capability: options.capability, model: provider.defaultModel, priority: provider.priority, weight: null, status: 'enabled', constraints: null, metadata: null, createdAt: provider.createdAt, updatedAt: provider.updatedAt },
        capability: options.capability, model: provider.defaultModel, adapterKey: 'openai-compatible',
      }))
    return { scene: { id: `nexus.intelligence.${options.capability}`, auditPolicy: { persistTrace: true } }, capability: options.capability, candidates, trace: [], fallbackTrail: [] }
  },
}))
vi.mock('./providerCredentialStore', () => ({
  getProviderCredential: async (event: unknown, authRef: string) => {
    const providerId = authRef.split('/').pop() ?? ''
    const apiKey = await registryRuntimeMocks.getProviderApiKey(event, 'user_1', providerId)
    return apiKey ? { apiKey } : null
  },
}))
vi.mock('./creditsStore', async () => {
  // Same shape as the adapter boundary suite: the price table needs a D1 handle, and the
  // in-memory pricing fake seeds itself with the shipped table. Loaded lazily because a
  // `vi.mock` factory is hoisted above this file's imports.
  const { MockCreditPricingD1Database } = await import('../../test/helpers/credit-pricing-test-utils')
  const pricingDb = new MockCreditPricingD1Database()
  return {
    consumeCredits: creditMocks.consumeCredits,
    releaseConsumedCredits: creditMocks.releaseConsumedCredits,
    requireDatabase: () => pricingDb,
  }
})
/**
 * The price table is stored in the database, but the rules it resolves are pure constants. These
 * tests resolve against the shipped table instead of a fake connection: every invoke now takes its
 * credit hold before it reaches the model, so without this the dispatch under test never happens.
 */
vi.mock('./creditPricingStore', async () => {
  const actual
    = await vi.importActual<typeof import('./creditPricingStore')>('./creditPricingStore')
  return {
    ...actual,
    resolveCreditPricingRule: vi.fn(async (_event: unknown, capability: string) =>
      actual.selectCreditPricingRule(capability, actual.DEFAULT_CREDIT_PRICING)
    ),
  }
})
vi.mock('./providerUsageLedgerStore', () => usageLedgerMocks)
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    invoke(messages: unknown) { return langchainMocks.invoke(messages) }
  },
}))

function event() {
  return { node: { req: { headers: { 'user-agent': 'vitest' } } }, context: {}, path: '/test' } as any
}

function provider(capabilities: string[]): IntelligenceProviderRecord {
  return {
    id: 'ip_ability',
    userId: 'user_1',
    type: 'openai',
    name: 'Ability Provider',
    enabled: true,
    hasApiKey: true,
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini'],
    defaultModel: 'gpt-4o-mini',
    instructions: null,
    timeout: 30000,
    priority: 1,
    rateLimit: null,
    capabilities,
    metadata: null,
    createdAt: '2026-05-12T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
  }
}

async function invoke(capabilityId: string, payload: Record<string, unknown>) {
  return await invokeIntelligenceCapability(event(), 'user_1', { capabilityId, payload })
}

describe('Nexus intelligence ability aggregation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registryRuntimeMocks.getProviderApiKey.mockResolvedValue('sk-test')
    usageLedgerMocks.recordProviderUsageLedger.mockResolvedValue([])
    creditMocks.consumeCredits.mockImplementation(
      async (_event: unknown, _userId: unknown, amount: number) => ({
        amount,
        ledgerId: 'ledger_reserve',
      })
    )
    creditMocks.releaseConsumedCredits.mockImplementation(
      async (_event: unknown, _userId: unknown, amount: number) => ({
        amount,
        ledgerId: 'ledger_release',
      })
    )
    langchainMocks.invoke.mockResolvedValue({ content: '{"keywords":["tuff"]}', usage_metadata: { total_tokens: 0 } })
  })

  it('builds keyword extraction messages through direct invoke', async () => {
    registryRuntimeMocks.listRegistryRuntimeProviders.mockResolvedValue([
      provider(['keywords.extract']),
    ])

    await invoke('keywords.extract', { text: 'Tuff is local-first AI.' })

    expect(langchainMocks.invoke).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ content: expect.stringContaining('keywords') }),
      expect.objectContaining({ content: 'Tuff is local-first AI.' }),
    ]))
  })

  it('builds intent detection messages through direct invoke', async () => {
    registryRuntimeMocks.listRegistryRuntimeProviders.mockResolvedValue([
      provider(['intent.detect']),
    ])

    await invoke('intent.detect', { text: 'summarize this note' })

    expect(langchainMocks.invoke).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ content: expect.stringContaining('intent') }),
      expect.objectContaining({ content: 'summarize this note' }),
    ]))
  })

  it('fails closed for non-chat provider shapes without model calls', async () => {
    registryRuntimeMocks.listRegistryRuntimeProviders.mockResolvedValue([
      provider(['image.generate', 'image.edit', 'audio.tts', 'embedding.generate']),
    ])

    await expect(invoke('images.generate', { prompt: 'robot' }))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(invoke('image.inpaint', { image: 'data:image/png;base64,abc', prompt: 'fix' }))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(invoke('audio.tts', { text: 'hello' }))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(invoke('embedding.generate', { text: 'hello' }))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(langchainMocks.invoke).not.toHaveBeenCalled()
  })
})
