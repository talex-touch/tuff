import type { IntelligenceProviderRecord } from './intelligenceStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invokeIntelligenceCapability } from './tuffIntelligenceLabService'

const storeMocks = vi.hoisted(() => ({
  createAudit: vi.fn(),
  getSettings: vi.fn(),
}))
const providerBridgeMocks = vi.hoisted(() => ({
  getIntelligenceProviderApiKeyWithRegistryFallback: vi.fn(),
  listIntelligenceProvidersWithRegistryMirrors: vi.fn(),
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
  return { ...actual, createAudit: storeMocks.createAudit, getSettings: storeMocks.getSettings }
})
vi.mock('./intelligenceProviderRegistryBridge', () => providerBridgeMocks)
vi.mock('./creditsStore', () => ({
  consumeCredits: creditMocks.consumeCredits,
  releaseConsumedCredits: creditMocks.releaseConsumedCredits,
  requireDatabase: vi.fn(),
}))
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
    storeMocks.getSettings.mockResolvedValue({ defaultStrategy: 'priority', enableAudit: false })
    providerBridgeMocks.getIntelligenceProviderApiKeyWithRegistryFallback.mockResolvedValue('sk-test')
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
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValue([
      provider(['keywords.extract']),
    ])

    await invoke('keywords.extract', { text: 'Tuff is local-first AI.' })

    expect(langchainMocks.invoke).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ content: expect.stringContaining('keywords') }),
      expect.objectContaining({ content: 'Tuff is local-first AI.' }),
    ]))
  })

  it('builds intent detection messages through direct invoke', async () => {
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValue([
      provider(['intent.detect']),
    ])

    await invoke('intent.detect', { text: 'summarize this note' })

    expect(langchainMocks.invoke).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ content: expect.stringContaining('intent') }),
      expect.objectContaining({ content: 'summarize this note' }),
    ]))
  })

  it('fails closed for non-chat provider shapes without model calls', async () => {
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValue([
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
