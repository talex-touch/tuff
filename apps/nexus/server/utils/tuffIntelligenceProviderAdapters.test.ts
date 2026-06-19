import type { IntelligenceProviderRecord } from './intelligenceStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invokeIntelligenceCapability } from './tuffIntelligenceLabService'
import {
  clearIntelligenceProviderAdaptersForTest,
  registerIntelligenceProviderAdapterForTest,
} from './tuffIntelligenceProviderAdapters'

const storeMocks = vi.hoisted(() => ({
  createAudit: vi.fn(),
  getSettings: vi.fn(),
}))
const providerBridgeMocks = vi.hoisted(() => ({
  getIntelligenceProviderApiKeyWithRegistryFallback: vi.fn(),
  listIntelligenceProvidersWithRegistryMirrors: vi.fn(),
}))
const creditStoreMocks = vi.hoisted(() => ({
  consumeCredits: vi.fn(),
}))
const usageLedgerMocks = vi.hoisted(() => ({
  recordProviderUsageLedger: vi.fn(),
}))
const langchainMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('./intelligenceStore', async () => {
  const actual = await vi.importActual<typeof import('./intelligenceStore')>('./intelligenceStore')
  return { ...actual, createAudit: storeMocks.createAudit, getSettings: storeMocks.getSettings }
})
vi.mock('./intelligenceProviderRegistryBridge', () => providerBridgeMocks)
vi.mock('./creditsStore', () => creditStoreMocks)
vi.mock('./providerUsageLedgerStore', () => usageLedgerMocks)
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    invoke(messages: unknown) { return langchainMocks.invoke(messages) }
  },
}))

function event() {
  return { node: { req: { headers: { 'user-agent': 'vitest' } } }, context: {}, path: '/test' } as any
}

function provider(): IntelligenceProviderRecord {
  return {
    id: 'ip_adapter',
    userId: 'user_1',
    type: 'openai',
    name: 'Adapter OpenAI',
    enabled: true,
    hasApiKey: true,
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini'],
    defaultModel: 'gpt-4o-mini',
    instructions: null,
    timeout: 30000,
    priority: 1,
    rateLimit: null,
    capabilities: ['text.chat'],
    metadata: null,
    createdAt: '2026-05-12T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
  }
}

describe('Nexus provider adapter boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearIntelligenceProviderAdaptersForTest()
    storeMocks.getSettings.mockResolvedValue({ defaultStrategy: 'priority', enableAudit: true })
    providerBridgeMocks.getIntelligenceProviderApiKeyWithRegistryFallback.mockResolvedValue('sk-test')
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValue([provider()])
    creditStoreMocks.consumeCredits.mockResolvedValue({
      ledgerId: 'credit_1',
      teamId: 'team_user_1',
      userId: 'user_1',
      amount: 3,
      reason: 'intelligence-invoke',
      createdAt: '2026-05-12T00:00:00.000Z',
      metadata: {},
    })
    usageLedgerMocks.recordProviderUsageLedger.mockResolvedValue([{ id: 'usage_1' }])
  })

  it('invokes direct chat through a swappable provider adapter', async () => {
    const adapter = vi.fn(async ({ context, messages }) => ({
      content: `adapter:${messages[0]?.content}`,
      model: context.model,
      traceId: 'trace_adapter_1',
      endpoint: 'adapter:openai:chat',
      status: 200,
      latency: 12,
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    }))
    registerIntelligenceProviderAdapterForTest('openai', adapter)

    const result = await invokeIntelligenceCapability(event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: { messages: [{ role: 'user', content: 'hello' }] },
    })

    expect(adapter).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ model: 'gpt-4o-mini' }),
      messages: [{ role: 'user', content: 'hello' }],
    }))
    expect(langchainMocks.invoke).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      result: 'adapter:hello',
      traceId: 'trace_adapter_1',
      metadata: { providerUsageLedgerIds: ['usage_1'] },
    })
    expect(creditStoreMocks.consumeCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      3,
      'intelligence-invoke',
      expect.objectContaining({ providerId: 'ip_adapter' }),
    )
  })
})
