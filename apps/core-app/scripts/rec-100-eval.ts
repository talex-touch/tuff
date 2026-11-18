#!/usr/bin/env tsx
/**
 * Reproducible CLI evaluator for the 100 Smart Recommendation & Dual-Layer Gemma scenarios (`#001`–`#100`).
 *
 * Evaluates all 100 scenarios under:
 *   (A) Legacy Single-Layer Baseline (no FileRecommendationBridge, SQLite-only file rebuild, no Gemma vector recall)
 *   (B) Dual-Layer Refactored Architecture (NativeFileArena + FileRecommendationBridge + Hot-Doc Gemma 768d Vectors)
 *
 * Usage:
 *   nice -n 10 pnpm -F @talex-touch/core-app exec tsx scripts/rec-100-eval.ts
 */

import fs from 'node:fs'
import Module from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface EvalRuntimeState {
  clipboardItem: { type: string; content: string; timestamp: Date } | null
  semanticSettings: {
    localVectorEnabled?: boolean
    aiEmbeddingEnabled?: boolean
    aiRerankEnabled?: boolean
  } | null
  embeddingGenerateImpl: ((payload: { text: string }) => Promise<{ result: number[] }>) | null
  embeddingGenerateCalls: number
}

const runtimeState: EvalRuntimeState = {
  clipboardItem: null,
  semanticSettings: null,
  embeddingGenerateImpl: null,
  embeddingGenerateCalls: 0
}

;(globalThis as Record<string, unknown>).__rec100EvalState = runtimeState

// Register async ESM loader hook for dynamic `await import(...)` of Electron-bound singletons
const esmHookCode = `
export async function load(url, context, nextLoad) {
  if (url.endsWith('/src/main/modules/clipboard.ts')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export const clipboardModule = { getLatestItem: () => globalThis.__rec100EvalState.clipboardItem };'
    };
  }
  if (url.endsWith('/src/main/modules/storage/index.ts')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export const isMainStorageReady = () => globalThis.__rec100EvalState.semanticSettings !== null; export const getMainConfig = () => globalThis.__rec100EvalState.semanticSettings ? { recommendation: { semantic: globalThis.__rec100EvalState.semanticSettings } } : undefined;'
    };
  }
  if (url.endsWith('/src/main/modules/ai/intelligence-sdk.ts')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export const tuffIntelligence = { embedding: { generate: async (p) => { const s = globalThis.__rec100EvalState; s.embeddingGenerateCalls += 1; return s.embeddingGenerateImpl ? await s.embeddingGenerateImpl(p) : { result: new Array(64).fill(0.1) }; } }, rag: { rerank: async () => ({ result: { results: [] } }) } };'
    };
  }
  return nextLoad(url, context);
}
`
Module.register(`data:text/javascript;base64,${Buffer.from(esmHookCode).toString('base64')}`)

const noop = () => {}
const noopLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  child: () => noopLogger
}

const pollingSingleton = {
  isRegistered: () => false,
  unregister: noop,
  register: noop,
  start: noop,
  stop: noop
}

const electronStub = {
  app: {
    getPath: (name: string) => (name === 'temp' ? os.tmpdir() : process.cwd()),
    isPackaged: false,
    getName: () => 'TuffEval',
    getVersion: () => '0.0.0'
  },
  shell: { openExternal: async () => undefined },
  clipboard: { readText: () => '', availableFormats: () => [] },
  powerMonitor: { on: noop, isOnBatteryPower: () => false },
  ipcMain: { handle: noop, on: noop },
  systemPreferences: {}
}

// Intercept CJS `require(...)` for Electron & background polling timers (NEVER launches Electron)
const modWithLoad = Module as unknown as {
  _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown
}
const originalLoad = modWithLoad._load

modWithLoad._load = function patchedRec100Load(
  request: string,
  parent: NodeModule | null,
  isMain: boolean
): unknown {
  if (request === 'electron') {
    return electronStub
  }

  if (request === '@talex-touch/utils/common/utils/polling') {
    return {
      PollingService: {
        getInstance: () => pollingSingleton
      }
    }
  }

  const parentDir = parent?.filename ? path.dirname(parent.filename) : __dirname
  const resolved = (request.startsWith('.') ? path.resolve(parentDir, request) : request)
    .replace(/\\/g, '/')
    .replace(/(\/index)?\.(ts|js|mjs|cjs)$/, '')

  if (resolved.endsWith('/search-engine/recommendation/recommendation-exposure-service')) {
    return {
      recommendationExposureService: {
        setTaggedKeys: noop,
        recordExposure: noop,
        recordClick: noop,
        getHitRate: async () => []
      }
    }
  }
  if (resolved.endsWith('/src/main/service/app-task-gate')) {
    return {
      appTaskGate: {
        isActive: () => false,
        waitForIdle: async () => undefined
      }
    }
  }
  if (resolved.endsWith('/src/main/db/db-write-scheduler')) {
    return {
      dbWriteScheduler: {
        schedule: async (_label: string, task: () => unknown) => await task()
      }
    }
  }
  if (resolved.endsWith('/src/main/modules/sentry')) {
    return {
      getSentryService: () => ({
        isTelemetryEnabled: () => false,
        queueNexusTelemetry: noop
      })
    }
  }
  if (resolved.endsWith('/src/main/utils/perf-context')) {
    return { enterPerfContext: () => noop }
  }
  if (resolved.endsWith('/src/main/utils/logger')) {
    return { createLogger: () => noopLogger }
  }
  if (resolved.endsWith('/src/main/modules/clipboard')) {
    return {
      clipboardModule: {
        getLatestItem: () => runtimeState.clipboardItem
      }
    }
  }
  if (resolved.endsWith('/src/main/modules/storage')) {
    return {
      isMainStorageReady: () => runtimeState.semanticSettings !== null,
      getMainConfig: () =>
        runtimeState.semanticSettings
          ? { recommendation: { semantic: runtimeState.semanticSettings } }
          : undefined
    }
  }
  if (resolved.endsWith('/src/main/modules/ai/intelligence-sdk')) {
    return {
      tuffIntelligence: {
        embedding: {
          generate: async (payload: { text: string }) => {
            runtimeState.embeddingGenerateCalls += 1
            if (runtimeState.embeddingGenerateImpl) {
              return await runtimeState.embeddingGenerateImpl(payload)
            }
            return { result: new Array(64).fill(0.1) }
          }
        },
        rag: {
          rerank: async () => ({ result: { results: [] } })
        }
      }
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '../../..')
  const defaultOutPath = path.join(
    repoRoot,
    'docs/engineering/reports/smart-recommendation-100-results.json'
  )
  const outFlagIdx = process.argv.indexOf('--out')
  const outPath =
    outFlagIdx >= 0 && process.argv[outFlagIdx + 1]
      ? path.resolve(process.argv[outFlagIdx + 1]!)
      : defaultOutPath

  // Pre-warm lazy schema/ORM modules so Scenario #001 measures steady-state runtime, not tsx transpile
  await import('drizzle-orm')
  await import('../src/main/db/schema')

  const { evaluateRec100Suite } =
    await import('../src/main/modules/box-tool/search-engine/recommendation/__benchmarks__/rec-100-harness')

  const report = await evaluateRec100Suite({
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
  })

  // Guarantee zero personal home directory strings in the serialized report
  const serialized = JSON.stringify(report, null, 2).split(os.homedir()).join('<home>')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${serialized}\n`, 'utf8')

  const relOut = path.relative(repoRoot, outPath)
  console.log('=== Tuff Smart Recommendation & Dual-Layer Gemma 100-Scenario Evaluation ===')
  console.log(
    `Legacy Single-Layer (A): ${report.legacySummary.passed}/${report.totalScenarios} (${report.legacySummary.passRatePct}%) | total=${report.legacySummary.totalDurationMs}ms | p50=${report.legacySummary.p50Ms}ms | p95=${report.legacySummary.p95Ms}ms`
  )
  console.log(
    `Dual-Layer Gemma+Arena (B): ${report.dualLayerSummary.passed}/${report.totalScenarios} (${report.dualLayerSummary.passRatePct}%) [+${report.dualLayerSummary.unlockedOverLegacy} scenarios] | total=${report.dualLayerSummary.totalDurationMs}ms | p50=${report.dualLayerSummary.p50Ms}ms | p95=${report.dualLayerSummary.p95Ms}ms`
  )
  console.log(
    `Footprint (100K cold files + 3,000 hot docs): Legacy=${report.footprint.legacySingleLayer100kFootprintMiB} MiB vs Dual-Layer=${report.footprint.dualLayerTotalFootprintMiB} MiB (< ${report.footprint.dualLayerBudgetLimitMiB} MiB budget)`
  )
  console.log('\nCategory Breakdown:')
  for (const cat of report.categories) {
    console.log(
      `  [${cat.categoryId}] ${cat.titleZh}: (A) ${cat.legacyPassed}/${cat.total} -> (B) ${cat.dualLayerPassed}/${cat.total} (avg ${cat.dualLayerAvgMs}ms)`
    )
  }
  console.log(`\nSaved JSON results -> ${relOut}`)

  if (report.dualLayerSummary.passed !== report.totalScenarios) {
    process.exitCode = 1
  }
}

void main().catch((error) => {
  console.error('rec-100-eval failed:', error)
  process.exitCode = 1
})
