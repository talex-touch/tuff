import os from 'node:os'
import type * as sqliteRetry from '../../../../../db/sqlite-retry'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const runtimeState = vi.hoisted(() => ({
  clipboardItem: null as { type: string; content: string; timestamp: Date } | null,
  semanticSettings: null as {
    localVectorEnabled?: boolean
    aiEmbeddingEnabled?: boolean
    aiRerankEnabled?: boolean
  } | null,
  embeddingGenerateImpl: null as
    | ((payload: { text: string }) => Promise<{ result: number[] }>)
    | null,
  embeddingGenerateCalls: 0
}))

const pollingMock = vi.hoisted(() => ({
  isRegistered: vi.fn(() => false),
  unregister: vi.fn(),
  register: vi.fn(),
  start: vi.fn(),
  stop: vi.fn()
}))

const exposureServiceMock = vi.hoisted(() => ({
  setTaggedKeys: vi.fn(),
  recordExposure: vi.fn(),
  recordClick: vi.fn(),
  getHitRate: vi.fn(async () => [])
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'temp' ? os.tmpdir() : process.cwd()),
    isPackaged: false,
    getName: () => 'TuffTest',
    getVersion: () => '0.0.0'
  },
  shell: {
    openExternal: vi.fn(async () => undefined)
  },
  clipboard: {
    readText: vi.fn(() => ''),
    availableFormats: vi.fn(() => [])
  },
  powerMonitor: {
    on: vi.fn(),
    isOnBatteryPower: vi.fn(() => false)
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  systemPreferences: {}
}))

vi.mock('../recommendation-exposure-service', () => ({
  recommendationExposureService: exposureServiceMock
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: () => pollingMock
  }
}))

vi.mock('../../../../../service/app-task-gate', () => ({
  appTaskGate: {
    isActive: vi.fn(() => false),
    waitForIdle: vi.fn(async () => undefined)
  }
}))

vi.mock('../../../../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: vi.fn(async (_label: string, task: () => unknown) => task())
  }
}))

vi.mock('../../../../../db/sqlite-retry', async (importOriginal) => ({
  ...(await importOriginal<typeof sqliteRetry>()),
  withSqliteRetry: vi.fn((task: () => unknown) => task())
}))

vi.mock('../../../../sentry', () => ({
  getSentryService: () => ({
    isTelemetryEnabled: () => false,
    queueNexusTelemetry: vi.fn()
  })
}))

vi.mock('../../../../../utils/perf-context', () => ({
  enterPerfContext: () => () => {}
}))

vi.mock('../../../../../utils/logger', () => ({
  createLogger: () => ({
    child: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn()
    }),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  })
}))

vi.mock('../../../../clipboard', () => ({
  clipboardModule: {
    getLatestItem: () => runtimeState.clipboardItem
  }
}))

vi.mock('../../../../storage', () => ({
  isMainStorageReady: () => runtimeState.semanticSettings !== null,
  getMainConfig: () =>
    runtimeState.semanticSettings
      ? { recommendation: { semantic: runtimeState.semanticSettings } }
      : undefined
}))

import {
  registerBoxToolAiCapabilityPort,
  resetBoxToolAiCapabilityPort
} from '../../../ports/ai-capability-port'
import {
  evaluateRec100Suite,
  type Rec100RuntimeHooks,
  type Rec100SuiteReport
} from './rec-100-harness'
import { REC_100_CATEGORIES, REC_100_SCENARIOS } from './rec-100-scenarios'

describe('Tuff Smart Recommendation & Dual-Layer Gemma 100-Scenario Coverage Suite', () => {
  let report: Rec100SuiteReport

  const hooks: Rec100RuntimeHooks = {
    setClipboardLatest: (item) => {
      runtimeState.clipboardItem = item
    },
    setSemanticSettings: (settings) => {
      runtimeState.semanticSettings = settings
    },
    setEmbeddingGenerateImpl: (fn) => {
      runtimeState.embeddingGenerateImpl = fn
    },
    getEmbeddingGenerateCallCount: () => runtimeState.embeddingGenerateCalls,
    resetEmbeddingGenerateCallCount: () => {
      runtimeState.embeddingGenerateCalls = 0
    }
  }

  beforeAll(async () => {
    registerBoxToolAiCapabilityPort({
      intelligence: {
        code: { review: vi.fn() },
        text: { summarize: vi.fn(), rewrite: vi.fn(), translate: vi.fn() },
        vision: { ocr: vi.fn(), caption: vi.fn() },
        embedding: {
          generate: vi.fn(async (payload: { text: string }) => {
            runtimeState.embeddingGenerateCalls += 1
            if (runtimeState.embeddingGenerateImpl) {
              return (await runtimeState.embeddingGenerateImpl(payload)) as never
            }
            return { result: new Array(64).fill(0.1) } as never
          }),
          generateLocalImage: vi.fn()
        },
        rag: {
          rerank: vi.fn(async () => ({ result: { results: [] } }) as never)
        }
      },
      normalizeIntelligenceError: (error, options) => ({
        code: 'UNKNOWN',
        message: String(error),
        reason: String(error),
        recovery: '',
        capabilityId: options?.capabilityId
      }),
      resolveCapabilityStatus: (capabilityId) => ({
        capabilityId,
        available: false,
        providerIds: []
      }),
      searchConversations: async () => [],
      isLocalEmbeddingReady: () => false,
      isLocalEmbeddingImageReady: () => false,
      getLocalEmbeddingModelKey: () => 'test-local-embedding-model',
      runWithEmbeddingPriority: (_priority, run) => run(),
      onUsageLimitsChanged: () => () => {},
      readUsageLimitInfo: (error) => {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'USAGE_LIMIT_REACHED' && 'usageLimit' in error) {
          return (error as { usageLimit: never }).usageLimit
        }
        return null
      }
    })
    report = await evaluateRec100Suite(hooks)
  }, 60_000)

  afterAll(() => {
    resetBoxToolAiCapabilityPort()
  })

  it('defines exactly 100 concrete scenarios across 10 balanced categories (10 each)', () => {
    expect(REC_100_CATEGORIES).toHaveLength(10)
    expect(REC_100_SCENARIOS).toHaveLength(100)
    for (const cat of REC_100_CATEGORIES) {
      const inCat = REC_100_SCENARIOS.filter((s) => s.categoryId === cat.id)
      expect(inCat).toHaveLength(10)
    }
    expect(report.totalScenarios).toBe(100)
  })

  it('proves the <80 MiB Dual-Layer storage budget vs Legacy 3.17 GiB single-layer bloat', () => {
    expect(report.footprint.hotDocVectorDim).toBe(768)
    expect(report.footprint.bytesPerVectorBlob).toBe(3072)
    expect(report.footprint.blobCompressionRatioPct).toBeGreaterThan(75)
    expect(report.footprint.dualLayerTotalFootprintMiB).toBeLessThan(80)
    expect(report.footprint.legacySingleLayer100kFootprintMiB).toBeGreaterThan(3000)
  })

  it('achieves 100/100 coverage in Dual-Layer Architecture while matching exact Legacy baseline expectations', () => {
    const failedInDualLayer = report.scenarios
      .filter((s) => !s.dualLayer.passed)
      .map((s) => `${s.id} (${s.title}): ${s.dualLayer.evidence}`)

    expect(failedInDualLayer).toEqual([])
    expect(report.dualLayerSummary.passed).toBe(100)
    expect(report.dualLayerSummary.passRatePct).toBe(100)
    expect(report.dualLayerSummary.unlockedOverLegacy).toBeGreaterThanOrEqual(65)
  })

  it.each(REC_100_SCENARIOS)('$id [$categoryId] $title', (scenarioDef) => {
    const evaluated = report.scenarios.find((s) => s.id === scenarioDef.id)
    expect(evaluated).toBeDefined()
    expect(evaluated!.legacy.passed).toBe(scenarioDef.expectedLegacyPass)
    expect(evaluated!.dualLayer.passed).toBe(scenarioDef.expectedDualLayerPass)
    // Ensure zero personal machine paths leak into evidence strings
    expect(evaluated!.dualLayer.evidence).not.toContain(os.homedir())
  })
})
