import type { H3Event } from 'h3'
import type { ProviderRegistryRecord } from './providerRegistryStore'
import type { SceneRegistryRecord } from './sceneRegistryStore'
import type { SceneRunResult, SceneRunUsage } from './sceneOrchestrator'
import type * as CreditPricingStoreModule from './creditPricingStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { selectCreditPricingRule } from './creditPricingStore'
import type { CreditPricingRule } from './creditPricingStore'
import {
  clearSceneCapabilityAdaptersForTest,
  registerSceneCapabilityAdapter,
  runSceneOrchestrator,
} from './sceneOrchestrator'

const storeMocks = vi.hoisted(() => ({
  getProviderRegistryEntry: vi.fn(),
  getSceneRegistryEntry: vi.fn(),
}))

const ledgerMocks = vi.hoisted(() => ({
  recordProviderUsageLedger: vi.fn(),
}))

const healthMocks = vi.hoisted(() => ({
  getLatestProviderHealthChecks: vi.fn(),
}))

const credentialMocks = vi.hoisted(() => ({
  getProviderCredential: vi.fn(),
}))

const creditsMocks = vi.hoisted(() => ({
  consumeCredits: vi.fn(),
  releaseConsumedCredits: vi.fn(),
}))

const pricingMocks = vi.hoisted(() => ({
  resolveCreditPricingRule: vi.fn(),
}))

vi.mock('./providerRegistryStore', () => ({
  getProviderRegistryEntry: storeMocks.getProviderRegistryEntry,
}))

vi.mock('./sceneRegistryStore', () => ({
  getSceneRegistryEntry: storeMocks.getSceneRegistryEntry,
}))

vi.mock('./providerUsageLedgerStore', () => ledgerMocks)
vi.mock('./providerHealthStore', () => healthMocks)
vi.mock('./providerCredentialStore', () => credentialMocks)
vi.mock('./exchangeRateService', () => ({ getUsdRates: vi.fn(), convertUsd: vi.fn() }))
vi.mock('./intelligenceVisionOcrProvider', () => ({ invokeIntelligenceVisionOcr: vi.fn() }))
vi.mock('@talex-touch/utils/network', () => ({ networkClient: { request: vi.fn() } }))
vi.mock('./creditsStore', () => creditsMocks)
// Only the stored price list needs a database; the pricing math stays real so the
// reserved and settled credits are the shipped price rather than a fixture.
vi.mock('./creditPricingStore', async (importOriginal) => {
  const actual = await importOriginal<typeof CreditPricingStoreModule>()
  return { ...actual, resolveCreditPricingRule: pricingMocks.resolveCreditPricingRule }
})

const SCENE_ID = 'corebox.selection.translate'
const PROVIDER_ID = 'prv_tencent_cloud_mt'
const OWNER_ID = 'user_1'

let ledgerSeq = 0

interface SceneRunFailure extends Error {
  statusCode: number
  statusMessage: string
  data: {
    code: string
    reason?: string
    run: SceneRunResult
  }
}

function isSceneRunFailure(value: unknown): value is SceneRunFailure {
  if (!value || typeof value !== 'object' || !('data' in value))
    return false
  const data = value.data
  if (!data || typeof data !== 'object')
    return false
  return 'run' in data && 'code' in data
}

function capability(name: string, unit = 'character') {
  return {
    id: `cap_${name.replaceAll('.', '_')}_${PROVIDER_ID}`,
    providerId: PROVIDER_ID,
    capability: name,
    schemaRef: `nexus://schemas/provider/${name}.v1`,
    metering: { unit },
    constraints: null,
    metadata: null,
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
  }
}

function binding(capabilityName: string, priority: number): SceneRegistryRecord['bindings'][number] {
  return {
    id: `binding_${capabilityName.replaceAll('.', '_')}`,
    sceneId: SCENE_ID,
    providerId: PROVIDER_ID,
    capability: capabilityName,
    priority,
    weight: null,
    status: 'enabled',
    constraints: null,
    metadata: null,
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
  }
}

function provider(overrides: Partial<ProviderRegistryRecord> = {}): ProviderRegistryRecord {
  return {
    id: PROVIDER_ID,
    name: 'tencent-cloud-mt-main',
    displayName: 'Tencent Cloud Machine Translation',
    vendor: 'tencent-cloud',
    status: 'enabled',
    authType: 'secret_pair',
    authRef: 'secure://providers/tencent-cloud-mt-main',
    ownerScope: 'system',
    ownerId: null,
    description: null,
    endpoint: 'https://tmt.tencentcloudapi.com',
    region: 'ap-shanghai',
    metadata: null,
    capabilities: [capability('text.translate')],
    createdBy: 'admin_1',
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    ...overrides,
  }
}

function scene(overrides: Partial<SceneRegistryRecord> = {}): SceneRegistryRecord {
  return {
    id: SCENE_ID,
    displayName: 'CoreBox Selection Translate',
    owner: 'core-app',
    ownerScope: 'system',
    ownerId: null,
    status: 'enabled',
    requiredCapabilities: ['text.translate'],
    strategyMode: 'priority',
    fallback: 'enabled',
    meteringPolicy: null,
    auditPolicy: { persistInput: false, persistOutput: false },
    metadata: null,
    bindings: [binding('text.translate', 10)],
    createdBy: 'admin_1',
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    ...overrides,
  }
}

/** OCR then translate: two capabilities, priced on two different bases. */
function chainedScene(overrides: Partial<SceneRegistryRecord> = {}): SceneRegistryRecord {
  return scene({
    requiredCapabilities: ['vision.ocr', 'text.translate'],
    bindings: [binding('vision.ocr', 10), binding('text.translate', 10)],
    ...overrides,
  })
}

/** The orchestrator only reads the request url and the D1 bindings off the event. */
function makeEvent(): H3Event {
  return {
    path: '/api/dashboard/provider-registry/scenes/corebox.selection.translate/run',
    node: { req: { url: '/api/dashboard/provider-registry/scenes/corebox.selection.translate/run' } },
    context: { params: {} },
  } as unknown as H3Event
}

function usage(overrides: Partial<SceneRunUsage> = {}): SceneRunUsage {
  return {
    unit: 'character',
    quantity: 1,
    billable: true,
    providerId: PROVIDER_ID,
    estimated: true,
    ...overrides,
  }
}

async function runExpectingFailure(request: Parameters<typeof runSceneOrchestrator>[2]): Promise<SceneRunFailure> {
  try {
    await runSceneOrchestrator(makeEvent(), SCENE_ID, request)
  }
  catch (error) {
    if (isSceneRunFailure(error))
      return error
    throw error
  }
  throw new Error('Expected the scene run to fail.')
}

/** `{ text: 'hello' }` is five characters, and chat text is priced at 1 credit per token. */
const TEXT_HOLD = 5

/**
 * The prices this suite meters against, held here rather than read from the shipped
 * table: what is under test is the orchestrator's algebra — one hold per capability
 * before dispatch, settlement of the reported quantity, release of the difference —
 * not the price of any capability. The shipped list has its own test.
 */
const SCENE_PRICING: readonly CreditPricingRule[] = [
  {
    capability: 'text.translate',
    unit: '1k_tokens',
    creditsPerUnit: 1000,
    secondaryUnit: null,
    secondaryCreditsPerUnit: null,
    minCredits: 1,
    reserveMultiplier: 1,
    upstreamCostUsdPerUnit: null,
    active: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    capability: 'vision.ocr',
    unit: 'image',
    creditsPerUnit: 20,
    secondaryUnit: null,
    secondaryCreditsPerUnit: null,
    minCredits: 1,
    reserveMultiplier: 1,
    upstreamCostUsdPerUnit: null,
    active: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

describe('runSceneOrchestrator credit metering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSceneCapabilityAdaptersForTest()
    ledgerSeq = 0
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene())
    storeMocks.getProviderRegistryEntry.mockResolvedValue(provider())
    ledgerMocks.recordProviderUsageLedger.mockResolvedValue([])
    healthMocks.getLatestProviderHealthChecks.mockResolvedValue(new Map())
    credentialMocks.getProviderCredential.mockResolvedValue({ apiKey: 'sk-test' })
    pricingMocks.resolveCreditPricingRule.mockImplementation(async (_event, capabilityName: string) =>
      selectCreditPricingRule(capabilityName, SCENE_PRICING),
    )
    creditsMocks.consumeCredits.mockImplementation(async (_event, userId, amount, reason, metadata) => ({
      ledgerId: `ledger_${++ledgerSeq}`,
      teamId: 'team_1',
      userId,
      amount,
      reason,
      createdAt: '2026-09-10T00:00:00.000Z',
      metadata: metadata ?? {},
    }))
    creditsMocks.releaseConsumedCredits.mockImplementation(async (_event, userId, amount, reason, metadata) => ({
      ledgerId: `ledger_${++ledgerSeq}`,
      teamId: 'team_1',
      userId,
      amount,
      reason,
      createdAt: '2026-09-10T00:00:00.000Z',
      metadata: metadata ?? {},
    }))
  })

  it('dry run 不占用也不释放任何额度', async () => {
    const adapter = vi.fn(async () => ({ output: { translatedText: 'translated' } }))
    registerSceneCapabilityAdapter('tencent-cloud:text.translate', adapter)

    const run = await runSceneOrchestrator(makeEvent(), SCENE_ID, {
      input: { text: 'hello' },
      ownerId: OWNER_ID,
      dryRun: true,
    })

    expect(run).toMatchObject({ status: 'planned', mode: 'dry_run' })
    expect(run.billing).toBeUndefined()
    expect(adapter).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
  })

  it('provider 调用前先占用估算额度，并按上报用量补扣差额', async () => {
    let holdsBeforeDispatch = -1
    registerSceneCapabilityAdapter('tencent-cloud:text.translate', async ({ provider: sceneProvider, capability: sceneCapability }) => {
      holdsBeforeDispatch = creditsMocks.consumeCredits.mock.calls.length
      return {
        output: { translatedText: 'translated' },
        usage: [usage({ quantity: 40, providerId: sceneProvider.id, capability: sceneCapability })],
      }
    })

    const run = await runSceneOrchestrator(makeEvent(), SCENE_ID, {
      input: { text: 'hello' },
      ownerId: OWNER_ID,
    })

    expect(holdsBeforeDispatch).toBe(1)
    expect(creditsMocks.consumeCredits).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      OWNER_ID,
      TEXT_HOLD,
      'scene-run-reserve',
      expect.objectContaining({ sceneId: SCENE_ID, runId: run.runId }),
      { idempotencyKey: `scene-run-reserve:${run.runId}` },
    )
    expect(creditsMocks.consumeCredits).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      OWNER_ID,
      35,
      'scene-run-settle',
      expect.objectContaining({ sceneId: SCENE_ID, runId: run.runId, chargedCredits: 40 }),
      { idempotencyKey: `scene-run-settle:${run.runId}` },
    )
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(run.billing).toEqual({
      reservedCredits: 5,
      chargedCredits: 40,
      releasedCredits: 0,
      ledgerId: 'ledger_1',
      settlementLedgerId: 'ledger_2',
      settleFailed: false,
    })
  })

  it('上报用量低于预留时退回未使用的差额', async () => {
    registerSceneCapabilityAdapter('tencent-cloud:text.translate', async ({ provider: sceneProvider, capability: sceneCapability }) => ({
      output: { translatedText: 'translated' },
      usage: [usage({ quantity: 2, providerId: sceneProvider.id, capability: sceneCapability })],
    }))

    const run = await runSceneOrchestrator(makeEvent(), SCENE_ID, {
      input: { text: 'hello' },
      ownerId: OWNER_ID,
    })

    expect(creditsMocks.consumeCredits).toHaveBeenCalledTimes(1)
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      expect.anything(),
      OWNER_ID,
      3,
      'scene-run-release',
      expect.objectContaining({ sceneId: SCENE_ID, runId: run.runId, chargedCredits: 2 }),
      { idempotencyKey: `scene-run-release:${run.runId}` },
    )
    expect(run.billing).toEqual({
      reservedCredits: 5,
      chargedCredits: 2,
      releasedCredits: 3,
      ledgerId: 'ledger_1',
      settlementLedgerId: null,
      settleFailed: false,
    })
  })

  it('上报用量与预留完全一致时不产生额外账本条目', async () => {
    registerSceneCapabilityAdapter('tencent-cloud:text.translate', async ({ provider: sceneProvider, capability: sceneCapability }) => ({
      output: { translatedText: 'translated' },
      usage: [usage({ quantity: 5, providerId: sceneProvider.id, capability: sceneCapability })],
    }))

    const run = await runSceneOrchestrator(makeEvent(), SCENE_ID, {
      input: { text: 'hello' },
      ownerId: OWNER_ID,
    })

    expect(creditsMocks.consumeCredits).toHaveBeenCalledTimes(1)
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(run.billing).toEqual({
      reservedCredits: 5,
      chargedCredits: 5,
      releasedCredits: 0,
      ledgerId: 'ledger_1',
      settlementLedgerId: null,
      settleFailed: false,
    })
  })

  it('run 中途失败时退回全部预留额度，不为已完成的部分工作计费', async () => {
    storeMocks.getSceneRegistryEntry.mockResolvedValue(chainedScene({ fallback: 'disabled' }))
    storeMocks.getProviderRegistryEntry.mockResolvedValue(provider({
      capabilities: [capability('vision.ocr', 'image'), capability('text.translate')],
    }))
    registerSceneCapabilityAdapter('tencent-cloud:vision.ocr', async ({ capability: sceneCapability }) => ({
      output: { text: 'recognized' },
      usage: [usage({ unit: 'image', quantity: 1, capability: sceneCapability })],
    }))
    registerSceneCapabilityAdapter('tencent-cloud:text.translate', async () => {
      throw new Error('provider exploded')
    })

    const failure = await runExpectingFailure({
      input: { imageBase64: 'aGVsbG8=', text: 'ok' },
      ownerId: OWNER_ID,
    })

    expect(failure).toMatchObject({
      statusCode: 502,
      statusMessage: 'provider exploded',
      data: { code: 'PROVIDER_ADAPTER_FAILED' },
    })
    expect(failure.data.run.billing).toEqual({
      reservedCredits: 22,
      chargedCredits: 0,
      releasedCredits: 22,
      ledgerId: 'ledger_1',
      settlementLedgerId: null,
      settleFailed: false,
    })
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      expect.anything(),
      OWNER_ID,
      22,
      'scene-run-release',
      expect.objectContaining({
        sceneId: SCENE_ID,
        runId: failure.data.run.runId,
        failureCode: 'PROVIDER_ADAPTER_FAILED',
      }),
      { idempotencyKey: `scene-run-release:${failure.data.run.runId}` },
    )
  })

  it('余额不足时在调用 provider 之前以 402 拒绝，且不产生返还条目', async () => {
    creditsMocks.consumeCredits.mockRejectedValueOnce(new Error('User credits exceeded.'))
    const adapter = vi.fn(async () => ({ output: { translatedText: 'translated' } }))
    registerSceneCapabilityAdapter('tencent-cloud:text.translate', adapter)

    const failure = await runExpectingFailure({
      input: { text: 'hello' },
      ownerId: OWNER_ID,
    })

    expect(failure).toMatchObject({
      statusCode: 402,
      statusMessage: 'CREDITS_EXCEEDED',
      data: { code: 'CREDITS_EXCEEDED', reason: 'User credits exceeded.' },
    })
    expect(adapter).not.toHaveBeenCalled()
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
  })

  it('按每个 capability 各自的单价计费', async () => {
    storeMocks.getSceneRegistryEntry.mockResolvedValue(chainedScene())
    storeMocks.getProviderRegistryEntry.mockResolvedValue(provider({
      capabilities: [capability('vision.ocr', 'image'), capability('text.translate')],
    }))
    registerSceneCapabilityAdapter('tencent-cloud:vision.ocr', async ({ capability: sceneCapability }) => ({
      output: { text: 'recognized' },
      usage: [usage({ unit: 'image', quantity: 1, capability: sceneCapability })],
    }))
    registerSceneCapabilityAdapter('tencent-cloud:text.translate', async ({ capability: sceneCapability }) => ({
      output: { translatedText: 'translated' },
      usage: [usage({ unit: 'token', quantity: 2000, capability: sceneCapability })],
    }))

    const run = await runSceneOrchestrator(makeEvent(), SCENE_ID, {
      input: { imageBase64: 'aGVsbG8=', text: 'ok' },
      ownerId: OWNER_ID,
    })

    expect(run).toMatchObject({ status: 'completed' })
    expect(creditsMocks.consumeCredits).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      OWNER_ID,
      22,
      'scene-run-reserve',
      expect.anything(),
      { idempotencyKey: `scene-run-reserve:${run.runId}` },
    )
    expect(run.billing).toEqual({
      reservedCredits: 22,
      chargedCredits: 2020,
      releasedCredits: 0,
      ledgerId: 'ledger_1',
      settlementLedgerId: 'ledger_2',
      settleFailed: false,
    })
  })

  it('不可计费或零用量的上报条目不产生费用', async () => {
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      requiredCapabilities: ['vision.ocr'],
      bindings: [binding('vision.ocr', 10)],
    }))
    storeMocks.getProviderRegistryEntry.mockResolvedValue(provider({
      capabilities: [capability('vision.ocr', 'image')],
    }))
    registerSceneCapabilityAdapter('tencent-cloud:vision.ocr', async ({ capability: sceneCapability }) => ({
      output: { text: 'recognized' },
      usage: [
        usage({ unit: 'image', quantity: 2, capability: sceneCapability }),
        usage({ unit: 'image', quantity: 5, billable: false, capability: sceneCapability }),
        usage({ unit: 'image', quantity: 0, capability: sceneCapability }),
      ],
    }))

    const run = await runSceneOrchestrator(makeEvent(), SCENE_ID, {
      input: { imageBase64: 'aGVsbG8=' },
      ownerId: OWNER_ID,
    })

    expect(run).toMatchObject({ status: 'completed' })
    expect(run.billing).toEqual({
      reservedCredits: 20,
      chargedCredits: 40,
      releasedCredits: 0,
      ledgerId: 'ledger_1',
      settlementLedgerId: 'ledger_2',
      settleFailed: false,
    })
  })
})
