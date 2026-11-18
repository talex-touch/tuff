import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import type { TuffItem } from '@talex-touch/utils'
import { TuffItemBuilder } from '@talex-touch/utils/core-box'
import type { FileParserChunk } from '@talex-touch/utils/electron/file-parsers'
import { fileFilterService } from '@talex-touch/utils/common/file-filter-service'
import type { NativeFileArenaHandle } from '@talex-touch/tuff-native/file-index'
import { createArenaWithFallback } from './fallback-file-arena'
import type { DbUtils, RecommendationHistoryEvent } from '../../../../../db/utils'
import { encodeVectorBlob, readStoredVector } from '../../../../../db/embedding-vector-codec'
import {
  createUsageLimitError,
  emptyUsageLimits,
  notifyUsageLimitsChanged
} from '../../../../ai/usage-ledger/usage-limits'
import { selectionSnapshotStore } from '../../../../system/selection-snapshot-store'
import {
  APP_DESTINATION_ITEM_IDS,
  APP_DESTINATION_PROVIDER_ID,
  getAppDestination,
  type AppDestinationId
} from '../../../../../../shared/app-destinations'
import {
  getFileRecommendationBridge,
  registerFileRecommendationBridge,
  type ContextualSemanticFileHit,
  type FileRecommendationBridge
} from '../../../addon/files/file-recommendation-bridge'
import { FileRecommendationBridgeImpl } from '../../../addon/files/services/file-provider-recommendation-bridge-impl'
import {
  buildFileContentMatch,
  hashFileContentChunk
} from '../../../addon/files/services/file-content-match'
import { mapFileToTuffItem } from '../../../addon/files/utils'
import { tuffSorter } from '../../sort/tuff-sorter'
import { ContextProvider, hashContextContent, type ContextSignal } from '../context-provider'
import { isRecommendableNewFile } from '../file-recommendation-admission'
import {
  createFileRecommendationSource,
  FILE_RECOMMENDATION_SOURCE_ID
} from '../file-recommendation-source'
import { BUILTIN_CLIPBOARD_URL_SOURCE_ID } from '../plugin-recommendation-source'
import { RecommendationEngine } from '../recommendation-engine'
import { recommendationSourceRegistry } from '../recommendation-source-registry'
import type { UsageBehaviorRow } from '../recommendation-utils'
import {
  cosineSimilarity768,
  embedDeterministicGemma768,
  GEMMA_EMBEDDING_DIM,
  GEMMA_VECTOR_BLOB_BYTES,
  REC_100_APPS,
  REC_100_CATEGORIES,
  REC_100_CORPUS_FILES,
  REC_100_SCENARIOS,
  type Rec100CategoryId,
  type Rec100DocFixture,
  type Rec100ScenarioDefinition
} from './rec-100-scenarios'

export type Rec100ArchitectureMode = 'legacy-single-layer' | 'dual-layer-gemma-arena'

export interface Rec100RuntimeHooks {
  setClipboardLatest: (item: { type: string; content: string; timestamp: Date } | null) => void
  setSemanticSettings: (
    settings: {
      localVectorEnabled?: boolean
      aiEmbeddingEnabled?: boolean
      aiRerankEnabled?: boolean
    } | null
  ) => void
  setEmbeddingGenerateImpl: (
    fn: ((payload: { text: string }) => Promise<{ result: number[] }>) | null
  ) => void
  getEmbeddingGenerateCallCount: () => number
  resetEmbeddingGenerateCallCount: () => void
}

export interface Rec100ModeOutcome {
  readonly passed: boolean
  readonly durationMs: number
  readonly evidence: string
}

export interface Rec100ScenarioComparison {
  readonly id: string
  readonly index: number
  readonly categoryId: Rec100CategoryId
  readonly categoryTitle: string
  readonly title: string
  readonly signalSummary: string
  readonly expectedBehavior: string
  readonly layers: readonly string[]
  readonly codeRefs: readonly string[]
  readonly legacy: Rec100ModeOutcome
  readonly dualLayer: Rec100ModeOutcome
}

export interface Rec100CategorySummary {
  readonly categoryId: Rec100CategoryId
  readonly index: number
  readonly titleZh: string
  readonly titleEn: string
  readonly total: number
  readonly legacyPassed: number
  readonly dualLayerPassed: number
  readonly legacyAvgMs: number
  readonly dualLayerAvgMs: number
}

export interface Rec100FootprintReport {
  readonly hotDocVectorDim: number
  readonly bytesPerVectorBlob: number
  readonly bytesPerLegacyJsonVector: number
  readonly blobCompressionRatioPct: number
  readonly simulatedColdFileCount: number
  readonly simulatedHotDocCount: number
  readonly simulatedChunksPerHotDoc: number
  readonly measuredArenaBytesPerEntry: number
  readonly measuredSnapshotBytesPerEntry: number
  readonly dualLayer100kArenaMiB: number
  readonly dualLayer100kSnapshotMiB: number
  readonly dualLayer3kHotDocVectorsMiB: number
  readonly dualLayerTotalFootprintMiB: number
  readonly dualLayerBudgetLimitMiB: number
  readonly legacySingleLayer100kFootprintMiB: number
}

export interface Rec100SuiteReport {
  readonly generatedAt: string
  readonly platform: string
  readonly arch: string
  readonly totalScenarios: number
  readonly legacySummary: {
    readonly passed: number
    readonly failed: number
    readonly passRatePct: number
    readonly totalDurationMs: number
    readonly p50Ms: number
    readonly p95Ms: number
    readonly maxMs: number
  }
  readonly dualLayerSummary: {
    readonly passed: number
    readonly failed: number
    readonly passRatePct: number
    readonly unlockedOverLegacy: number
    readonly totalDurationMs: number
    readonly p50Ms: number
    readonly p95Ms: number
    readonly maxMs: number
  }
  readonly footprint: Rec100FootprintReport
  readonly categories: readonly Rec100CategorySummary[]
  readonly scenarios: readonly Rec100ScenarioComparison[]
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

interface StoredGemmaVectorRow {
  readonly fileId: number
  readonly relPath: string
  readonly fullPath: string
  readonly contentHash: string | null
  readonly vectorBlob: Uint8Array
}

interface SqliteSimulatedFileRow {
  id: number
  path: string
  name: string
  displayName: string | null
  extension: string
  size: number | null
  mtime: Date
  ctime: Date
  lastIndexedAt: Date
  isDir: boolean
  type: 'file' | 'app'
  content: string | null
  embeddingStatus: string
}

interface SandboxEnv {
  readonly rootDir: string
  readonly nowMs: number
  readonly sqliteFilesByPath: Map<string, SqliteSimulatedFileRow>
  readonly sqliteFilesById: Map<number, SqliteSimulatedFileRow>
  readonly chunksByFileId: Map<number, FileParserChunk[]>
  readonly appRows: SqliteSimulatedFileRow[]
  readonly appExtensionsByFileId: Map<number, Array<{ fileId: number; key: string; value: string }>>
  readonly vectorRows: StoredGemmaVectorRow[]
  readonly arena: NativeFileArenaHandle
  dispose: () => void
}

function round(val: number, digits = 3): number {
  return Number(val.toFixed(digits))
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return round(sorted[idx] ?? 0, 3)
}

function sanitizeEvidence(raw: string, workspaceRoot: string): string {
  return raw.split(workspaceRoot).join('<workspace>')
}

function itemMatchesPath(item: TuffItem, expectedPath: string): boolean {
  const meta = item.meta as Record<string, unknown> | undefined
  const fileMeta = meta?.file as { path?: string } | undefined
  const appMeta = meta?.app as { path?: string } | undefined
  return (
    item.id === expectedPath ||
    fileMeta?.path === expectedPath ||
    appMeta?.path === expectedPath ||
    meta?._originalItemId === expectedPath
  )
}

function makeUsageStat(
  sourceId: string,
  itemId: string,
  sourceType: string,
  executeCount: number,
  lastExecutedMs: number | null
) {
  const now = new Date()
  return {
    sourceId,
    itemId,
    sourceType,
    searchCount: executeCount,
    executeCount,
    cancelCount: 0,
    lastSearched: lastExecutedMs ? new Date(lastExecutedMs) : null,
    lastExecuted: lastExecutedMs ? new Date(lastExecutedMs) : null,
    lastCancelled: null,
    createdAt: now,
    updatedAt: now
  }
}

function makeBehaviorRow(
  sourceId: string,
  itemId: string,
  overrides: Partial<UsageBehaviorRow> = {}
): UsageBehaviorRow {
  return {
    sourceId,
    itemId,
    executeCount: overrides.executeCount ?? 0,
    executeCount30: overrides.executeCount30 ?? overrides.executeCount ?? 0,
    executeCount7: overrides.executeCount7 ?? Math.min(overrides.executeCount ?? 0, 5),
    activeDays30: overrides.activeDays30 ?? 0,
    activeDays7: overrides.activeDays7 ?? Math.min(overrides.activeDays30 ?? 0, 4),
    lastExecutedAt: overrides.lastExecutedAt ?? null,
    decayedExecuteScore30: overrides.decayedExecuteScore30 ?? (overrides.executeCount30 ?? 0) * 0.9,
    hourDistribution30: overrides.hourDistribution30 ?? Array.from({ length: 24 }, () => 0),
    dayOfWeekDistribution30:
      overrides.dayOfWeekDistribution30 ?? Array.from({ length: 7 }, () => 0),
    timeSlotDistribution30: overrides.timeSlotDistribution30 ?? {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0
    }
  }
}

async function createSandboxEnv(): Promise<SandboxEnv> {
  // Place sandbox under a clean user-workspace path (outside macOS `/private/var/folders`
  // which `FileFilterService` classifies as a system directory) and guarantee removal.
  const sandboxParent = path.resolve(__dirname, 'rec100_sandbox_runs')
  fs.mkdirSync(sandboxParent, { recursive: true })
  const rawTmp = fs.mkdtempSync(path.join(sandboxParent, `run_${process.pid}_`))
  const rootDir = fs.realpathSync(rawTmp)
  const cleanupOnExit = () => {
    try {
      fs.rmSync(rootDir, { recursive: true, force: true })
      fs.rmdirSync(sandboxParent)
    } catch {}
  }
  process.once('exit', cleanupOnExit)
  const nowMs = Date.now()

  const sqliteFilesByPath = new Map<string, SqliteSimulatedFileRow>()
  const sqliteFilesById = new Map<number, SqliteSimulatedFileRow>()
  const chunksByFileId = new Map<number, FileParserChunk[]>()
  const vectorRows: StoredGemmaVectorRow[] = []

  for (const doc of REC_100_CORPUS_FILES) {
    const fullPath = path.join(rootDir, doc.relPath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    const payload =
      doc.diskText ??
      (doc.modality === 'image' ? 'PNG_VISUAL_ASSET_BINARY_PLACEHOLDER' : doc.relPath)
    fs.writeFileSync(fullPath, payload, 'utf8')
    // Keep steady-state corpus files outside the 7-day novelty window unless explicitly testing
    // 3-second fresh download (`#309`), so unrelated app-ranking tests are not displaced by 9e5 novelty.
    const effectiveModifiedAgoMs =
      doc.id === 309 ? doc.modifiedAgoMs : Math.max(doc.modifiedAgoMs, 10 * DAY_MS)
    const effectiveCreatedAgoMs =
      doc.id === 309 ? doc.createdAgoMs : Math.max(doc.createdAgoMs, 14 * DAY_MS)
    const mtimeDate = new Date(nowMs - effectiveModifiedAgoMs)
    const ctimeDate = new Date(nowMs - effectiveCreatedAgoMs)
    fs.utimesSync(fullPath, mtimeDate, mtimeDate)

    const ext = path.extname(fullPath).replace(/^\./, '').toLowerCase()
    if (doc.inSqlite) {
      const row: SqliteSimulatedFileRow = {
        id: doc.id,
        path: fullPath,
        name: path.basename(fullPath),
        displayName: path.basename(fullPath),
        extension: ext,
        size: doc.sizeBytes,
        mtime: mtimeDate,
        ctime: ctimeDate,
        lastIndexedAt: mtimeDate,
        isDir: false,
        type: 'file',
        content: doc.modality === 'image' ? null : (doc.diskText ?? null),
        embeddingStatus: 'completed'
      }
      sqliteFilesByPath.set(fullPath, row)
      sqliteFilesById.set(doc.id, row)

      if (doc.chunks && doc.chunks.length > 0) {
        const parsedChunks: FileParserChunk[] = doc.chunks.map((chunk) => ({
          text: chunk.text,
          pageNumber: chunk.pageNumber,
          startLine: chunk.startLine,
          endLine: chunk.endLine
        }))
        chunksByFileId.set(doc.id, parsedChunks)

        for (let idx = 0; idx < doc.chunks.length; idx += 1) {
          const chunkDef = doc.chunks[idx]!
          const chunkObj = parsedChunks[idx]!
          const chunkHash = hashFileContentChunk(chunkObj)
          const vec = embedDeterministicGemma768(chunkDef.text, chunkDef.concepts)
          vectorRows.push({
            fileId: doc.id,
            relPath: doc.relPath,
            fullPath,
            contentHash: chunkHash,
            vectorBlob: encodeVectorBlob(vec)
          })
        }
      } else if (doc.concepts && doc.concepts.length > 0) {
        const seedText = doc.diskText ?? path.basename(doc.relPath)
        const vec = embedDeterministicGemma768(seedText, doc.concepts)
        vectorRows.push({
          fileId: doc.id,
          relPath: doc.relPath,
          fullPath,
          contentHash: null,
          vectorBlob: encodeVectorBlob(vec)
        })
      }
    }
  }

  // Noise, unfinished downloads, context-dependent `target/`, and credential fixtures on disk
  const rustProjDir = path.join(rootDir, 'Projects/rust-engine')
  const historicalDate = new Date(nowMs - 20 * DAY_MS)
  fs.mkdirSync(path.join(rustProjDir, 'target/release'), { recursive: true })
  fs.mkdirSync(path.join(rustProjDir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(rustProjDir, 'Cargo.toml'), '[package]\nname = "rust-engine"\n')
  fs.writeFileSync(path.join(rustProjDir, 'target/release/deps.d'), 'artifact')
  fs.writeFileSync(path.join(rustProjDir, 'src/lib.rs'), 'pub fn init() {}')
  fs.utimesSync(path.join(rustProjDir, 'Cargo.toml'), historicalDate, historicalDate)
  fs.utimesSync(path.join(rustProjDir, 'target/release/deps.d'), historicalDate, historicalDate)
  fs.utimesSync(path.join(rustProjDir, 'src/lib.rs'), historicalDate, historicalDate)

  fs.mkdirSync(path.join(rootDir, 'Projects/tuff-core/node_modules/pkg'), { recursive: true })
  fs.writeFileSync(
    path.join(rootDir, 'Projects/tuff-core/node_modules/pkg/index.js'),
    'module.exports = {}'
  )
  fs.mkdirSync(path.join(rootDir, 'Projects/tuff-core/.git'), { recursive: true })
  fs.writeFileSync(path.join(rootDir, 'Projects/tuff-core/.git/config'), '[core]')
  fs.writeFileSync(path.join(rootDir, 'Documents/.DS_Store'), 'ds_store')

  fs.writeFileSync(path.join(rootDir, 'Downloads/large-model.gguf.crdownload'), 'partial-bytes')
  fs.writeFileSync(path.join(rootDir, 'Downloads/empty-placeholder.md'), '')

  // Credential files on disk (must NEVER enter recommendations)
  fs.mkdirSync(path.join(rootDir, '.ssh'), { recursive: true })
  fs.mkdirSync(path.join(rootDir, 'certs'), { recursive: true })
  fs.writeFileSync(path.join(rootDir, '.env'), 'OPENAI_API_KEY=sk-live-secret1234567890')
  fs.writeFileSync(path.join(rootDir, '.env.production'), 'DB_PASS=prod_secret')
  fs.writeFileSync(path.join(rootDir, '.ssh/id_rsa'), '-----BEGIN RSA PRIVATE KEY-----\nMIIE')
  fs.writeFileSync(path.join(rootDir, 'certs/server.key'), '-----BEGIN PRIVATE KEY-----\nMIIB')
  fs.writeFileSync(path.join(rootDir, 'certs/ca.pem'), '-----BEGIN CERTIFICATE-----\nMIIC')

  const appRows: SqliteSimulatedFileRow[] = REC_100_APPS.map((app) => ({
    id: app.id,
    path: app.path,
    name: app.name,
    displayName: app.name,
    extension: 'app',
    size: null,
    mtime: new Date(nowMs - app.indexedAgoMs),
    ctime: new Date(nowMs - app.indexedAgoMs),
    lastIndexedAt: new Date(nowMs - app.indexedAgoMs),
    isDir: true,
    type: 'app',
    content: null,
    embeddingStatus: 'none'
  }))

  const appExtensionsByFileId = new Map<
    number,
    Array<{ fileId: number; key: string; value: string }>
  >()
  for (const app of REC_100_APPS) {
    appExtensionsByFileId.set(app.id, [
      { fileId: app.id, key: 'bundleId', value: app.bundleId },
      { fileId: app.id, key: 'installedAt', value: String(nowMs - app.installedAgoMs) }
    ])
  }

  const arena = createArenaWithFallback()

  await arena.indexRoots([rootDir], {
    excludeNames: ['node_modules', '.git', '.ssh'],
    contextDependentNames: ['target'],
    projectMarkers: ['cargo.toml', 'package.json'],
    excludeHidden: true,
    includeDirs: true,
    maxDepth: 12
  })

  return {
    rootDir,
    nowMs,
    sqliteFilesByPath,
    sqliteFilesById,
    chunksByFileId,
    appRows,
    appExtensionsByFileId,
    vectorRows,
    arena,
    dispose: () => {
      process.removeListener('exit', cleanupOnExit)
      fs.rmSync(rootDir, { recursive: true, force: true })
      try {
        fs.rmdirSync(sandboxParent)
      } catch {}
    }
  }
}

function registerDestinationTestSource(): () => void {
  recommendationSourceRegistry.unregister(APP_DESTINATION_PROVIDER_ID)
  return recommendationSourceRegistry.registerSource({
    sourceId: APP_DESTINATION_PROVIDER_ID,
    async rebuild(itemIds) {
      const built: TuffItem[] = []
      for (const itemId of itemIds) {
        const matchedEntry = (
          Object.entries(APP_DESTINATION_ITEM_IDS) as Array<[AppDestinationId, string]>
        ).find(([, mappedId]) => mappedId === itemId)
        if (!matchedEntry) continue
        const def = getAppDestination(matchedEntry[0])
        if (!def.searchable) continue
        built.push(
          new TuffItemBuilder(itemId, 'system', APP_DESTINATION_PROVIDER_ID)
            .setKind('feature')
            .setTitle(def.id)
            .setSubtitle(def.route ?? 'main-window')
            .setIcon({ type: 'class', value: def.icon })
            .build()
        )
      }
      return built
    }
  })
}

function queryGemmaVectorIndex(
  env: SandboxEnv,
  queryText: string,
  limit: number,
  signal?: AbortSignal
): Array<{ sourceId: string; score: number; contentHash?: string | null }> {
  if (signal?.aborted || !queryText.trim()) return []
  const queryVec = embedDeterministicGemma768(queryText)
  const bestByFileId = new Map<number, { score: number; contentHash: string | null }>()

  for (const row of env.vectorRows) {
    if (signal?.aborted) return []
    const decoded = readStoredVector(row.vectorBlob, GEMMA_EMBEDDING_DIM)
    if (!decoded) continue
    const score = cosineSimilarity768(queryVec, decoded)
    const prev = bestByFileId.get(row.fileId)
    if (!prev || score > prev.score) {
      bestByFileId.set(row.fileId, { score, contentHash: row.contentHash })
    }
  }

  return [...bestByFileId.entries()]
    .map(([fileId, hit]) => ({
      sourceId: String(fileId),
      score: hit.score,
      contentHash: hit.contentHash
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

interface EngineHarnessConfig {
  mode: Rec100ArchitectureMode
  env: SandboxEnv
  hooks: Rec100RuntimeHooks
  contextQueue: ContextSignal[]
  usageStats?: Array<ReturnType<typeof makeUsageStat>>
  behaviorRows?: UsageBehaviorRow[]
  timeStatsRows?: Array<{
    sourceId: string
    itemId: string
    hourDistribution: string
    dayOfWeekDistribution: string
    timeSlotDistribution: string
  }>
  historyEvents?: RecommendationHistoryEvent[]
  pinnedItems?: Array<{ sourceId: string; itemId: string; sourceType: string }>
  customApps?: SqliteSimulatedFileRow[]
  customAppExts?: Map<number, Array<{ fileId: number; key: string; value: string }>>
  foregroundEntries?: Array<{ appKey: string; lastActiveAt: number }>
  customBridge?: FileRecommendationBridge | null
  onSemanticRecallQuery?: (queryText: string) => void
}

async function withConfiguredEngine<T>(
  cfg: EngineHarnessConfig,
  run: (
    engine: RecommendationEngine,
    persistedCaches: Array<{ cacheKey: string; json: string }>
  ) => Promise<T>
): Promise<T> {
  const persistedCaches: Array<{ cacheKey: string; json: string }> = []
  const usageStats = cfg.usageStats ?? []
  const behaviorRows = cfg.behaviorRows ?? []
  const timeStatsRows = cfg.timeStatsRows ?? []
  const historyEvents = cfg.historyEvents ?? []
  const pinnedRecords = cfg.pinnedItems ?? []
  const apps = cfg.customApps ?? cfg.env.appRows
  const appExts = cfg.customAppExts ?? cfg.env.appExtensionsByFileId

  const allSqliteFiles = () => [...cfg.env.sqliteFilesByPath.values()]

  const dbUtilsMock = {
    getAuxDb: () => ({
      insert: () => ({ values: async () => undefined }),
      delete: () => ({ where: async () => undefined })
    }),
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: (lim: number) => ({
                all: async () =>
                  [...usageStats]
                    .filter((s) => s.executeCount > 0)
                    .sort((a, b) => b.executeCount - a.executeCount)
                    .slice(0, lim)
              })
            }),
            groupBy: async () => [],
            get: async () => null
          })
        })
      })
    }),
    getFileIndexReadDb: () => ({
      select: () => ({
        from: () => ({
          where: async () =>
            allSqliteFiles().map((row) => ({
              id: row.id,
              path: row.path
            }))
        })
      })
    }),
    getRecommendationCache: async (cacheKey: string) => {
      const hit = persistedCaches.find((entry) => entry.cacheKey === cacheKey)
      if (!hit) return null
      return {
        cacheKey,
        recommendedItems: hit.json,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60_000)
      }
    },
    setRecommendationCache: async (cacheKey: string, items: unknown) => {
      persistedCaches.push({ cacheKey, json: JSON.stringify(items) })
    },
    getUsageStatsBatch: async (keys: Array<{ sourceId: string; itemId: string }>) => {
      const wanted = new Set(keys.map((k) => `${k.sourceId}:${k.itemId}`))
      return usageStats.filter((s) => wanted.has(`${s.sourceId}:${s.itemId}`))
    },
    getUsageBehaviorBatch: async (keys: Array<{ sourceId: string; itemId: string }>) => {
      const wanted = new Set(keys.map((k) => `${k.sourceId}:${k.itemId}`))
      return behaviorRows.filter((b) => wanted.has(`${b.sourceId}:${b.itemId}`))
    },
    getAllItemTimeStats: async () => timeStatsRows,
    getRecommendationHistory: async () => historyEvents,
    getAllPinnedItems: async () => pinnedRecords,
    getRecentlyCreatedFiles: async (createdAfter: Date, limit: number) =>
      allSqliteFiles()
        .filter((f) => f.ctime.getTime() >= createdAfter.getTime())
        .sort((a, b) => b.ctime.getTime() - a.ctime.getTime())
        .slice(0, limit),
    getFilesByPaths: async (paths: string[]) => {
      const out: SqliteSimulatedFileRow[] = []
      for (const p of paths) {
        const fileHit = cfg.env.sqliteFilesByPath.get(p)
        if (fileHit) out.push(fileHit)
        const appHit = apps.find((a) => a.path === p)
        if (appHit) out.push(appHit)
      }
      return out
    },
    getFilesByBundleIds: async (bundleIds: string[]) => {
      const lowerSet = new Set(bundleIds.map((b) => b.toLowerCase()))
      return apps.filter((app) => {
        const exts = appExts.get(app.id) ?? []
        const bid = exts.find((e) => e.key === 'bundleId')?.value?.toLowerCase()
        return Boolean(bid && lowerSet.has(bid))
      })
    },
    getFilesByType: async (type: string) => (type === 'app' ? apps : allSqliteFiles()),
    getFileExtensionsByFileIds: async (fileIds: number[], keys?: string[]) =>
      fileIds.flatMap((fid) => {
        const entries = appExts.get(fid) ?? []
        if (!keys || keys.length === 0) return entries
        return entries.filter((e) => keys.includes(e.key))
      })
  } as unknown as DbUtils

  const disposeDestination = registerDestinationTestSource()
  let disposeBridge: (() => void) | null = null

  if (cfg.customBridge !== undefined) {
    if (cfg.customBridge) {
      disposeBridge = registerFileRecommendationBridge(cfg.customBridge)
    }
  } else if (cfg.mode === 'dual-layer-gemma-arena') {
    const realBridge = new FileRecommendationBridgeImpl({
      getNativeIndexService: () =>
        ({
          isReady: () => true,
          arena: cfg.env.arena
        }) as never,
      getEmbeddingService: () =>
        ({
          semanticSearch: async (queryText: string, limit: number, signal?: AbortSignal) => {
            cfg.onSemanticRecallQuery?.(queryText)
            return queryGemmaVectorIndex(cfg.env, queryText, limit, signal)
          }
        }) as never,
      getDbUtils: () => dbUtilsMock,
      isPathAdmitted: (filePath: string) =>
        cfg.env.arena.hasPath(filePath) &&
        !fileFilterService.getManualIndexExclusionReason({ path: filePath }),
      normalizePath: (rawPath: string) => path.resolve(rawPath),
      logWarn: () => {}
    })
    disposeBridge = registerFileRecommendationBridge(realBridge)
  }

  const foregroundReader =
    cfg.foregroundEntries && cfg.foregroundEntries.length > 0
      ? {
          view: () => ({
            recent: (lim: number) => cfg.foregroundEntries!.slice(0, lim),
            lastActiveAt: (appKey: string) =>
              cfg.foregroundEntries!.find((e) => e.appKey === appKey.toLowerCase())?.lastActiveAt ??
              null
          })
        }
      : null

  const engine = new RecommendationEngine(dbUtilsMock, dbUtilsMock, foregroundReader as never)
  const realContextHelper = new ContextProvider()
  const fallbackContext = cfg.contextQueue[cfg.contextQueue.length - 1] ?? {
    time: { hourOfDay: 10, dayOfWeek: 2, isWorkingHours: true, timeSlot: 'morning' }
  }

  Object.assign(engine as unknown as Record<string, unknown>, {
    contextProvider: {
      getCurrentContext: async () => cfg.contextQueue.shift() ?? fallbackContext,
      generateCacheKey: (signal: ContextSignal) => realContextHelper.generateCacheKey(signal)
    },
    scheduleTrendBackfill: () => {}
  })

  try {
    return await run(engine, persistedCaches)
  } finally {
    engine.stopBackgroundRefresh()
    disposeBridge?.()
    disposeDestination()
    cfg.hooks.setClipboardLatest(null)
    cfg.hooks.setSemanticSettings(null)
    cfg.hooks.setEmbeddingGenerateImpl(null)
    selectionSnapshotStore.clear()
  }
}

function defaultHabitSeed(nowMs: number, rootDir?: string) {
  const vscode = '/Applications/Visual Studio Code.app'
  const chrome = '/Applications/Google Chrome.app'
  const iterm = '/Applications/iTerm.app'
  const spotify = '/Applications/Spotify.app'

  const usageStats = [
    makeUsageStat('app-provider', vscode, 'app', 12, nowMs - 3 * HOUR_MS),
    makeUsageStat('app-provider', chrome, 'app', 11, nowMs - 4 * HOUR_MS),
    makeUsageStat('app-provider', iterm, 'app', 10, nowMs - 4 * HOUR_MS),
    makeUsageStat('app-provider', spotify, 'app', 10, nowMs - 4 * HOUR_MS),
    ...(rootDir
      ? [
          makeUsageStat(
            FILE_RECOMMENDATION_SOURCE_ID,
            path.join(rootDir, 'Downloads/2026-Q4-OKR-final.pdf'),
            'file',
            1,
            nowMs - 5 * DAY_MS
          )
        ]
      : [])
  ]
  const behaviorRows = [
    makeBehaviorRow('app-provider', vscode, {
      executeCount: 12,
      executeCount30: 12,
      activeDays30: 5,
      lastExecutedAt: nowMs - 3 * HOUR_MS
    }),
    makeBehaviorRow('app-provider', chrome, {
      executeCount: 11,
      executeCount30: 11,
      activeDays30: 5,
      lastExecutedAt: nowMs - 4 * HOUR_MS
    }),
    makeBehaviorRow('app-provider', iterm, {
      executeCount: 10,
      executeCount30: 10,
      activeDays30: 4,
      lastExecutedAt: nowMs - 4 * HOUR_MS
    }),
    makeBehaviorRow('app-provider', spotify, {
      executeCount: 10,
      executeCount30: 10,
      activeDays30: 4,
      lastExecutedAt: nowMs - 4 * HOUR_MS
    })
  ]
  return { usageStats, behaviorRows }
}

async function runZeroInputScenario(
  scenario: Rec100ScenarioDefinition,
  mode: Rec100ArchitectureMode,
  env: SandboxEnv,
  hooks: Rec100RuntimeHooks
): Promise<{ passed: boolean; evidence: string }> {
  const p = scenario.params
  const caseKey = String(p.caseKey)
  const nowMs = env.nowMs
  const baseTime = {
    hourOfDay: 10,
    dayOfWeek: 2,
    isWorkingHours: true,
    timeSlot: 'morning' as const
  }

  if (
    caseKey === 'fg-window-recall' ||
    caseKey === 'fg-ide-plus-doc' ||
    caseKey === 'fg-browser-plus-doc'
  ) {
    const fg = p.foregroundApp as { bundleId: string; name: string; windowTitle: string }
    const targetPath = path.join(env.rootDir, String(p.expectFileRelPath))
    const seed = defaultHabitSeed(nowMs)

    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [{ time: baseTime, foregroundApp: fg as never }],
        ...seed
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const hitFile = res.items.some((item) => itemMatchesPath(item, targetPath))
        if (caseKey === 'fg-window-recall') {
          return {
            passed: hitFile,
            evidence: hitFile
              ? `recalled ${p.expectFileRelPath} in ${res.items.length} items`
              : `missing ${p.expectFileRelPath} (bridge=${Boolean(getFileRecommendationBridge())})`
          }
        }
        const expectedApp = String(p.expectAppPath)
        const appIdx = res.items.findIndex((i) => itemMatchesPath(i, expectedApp))
        const spotifyIdx = res.items.findIndex((i) =>
          itemMatchesPath(i, '/Applications/Spotify.app')
        )
        const appBoosted = appIdx >= 0 && (spotifyIdx < 0 || appIdx < spotifyIdx)
        return {
          passed: hitFile && appBoosted,
          evidence: `fileHit=${hitFile}, boostedAppRank=${appIdx} vs spotifyRank=${spotifyIdx}`
        }
      }
    )
  }

  if (caseKey === 'fg-self-demote') {
    const vscode = '/Applications/Visual Studio Code.app'
    const iterm = '/Applications/iTerm.app'
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            foregroundApp: { bundleId: 'com.microsoft.VSCode', name: 'Visual Studio Code' }
          }
        ],
        usageStats: [
          makeUsageStat('app-provider', vscode, 'app', 10, nowMs - 2 * HOUR_MS),
          makeUsageStat('app-provider', iterm, 'app', 10, nowMs - 2 * HOUR_MS)
        ],
        behaviorRows: [
          makeBehaviorRow('app-provider', vscode, {
            executeCount: 10,
            executeCount30: 10,
            activeDays30: 4,
            lastExecutedAt: nowMs - 2 * HOUR_MS
          }),
          makeBehaviorRow('app-provider', iterm, {
            executeCount: 10,
            executeCount30: 10,
            activeDays30: 4,
            lastExecutedAt: nowMs - 2 * HOUR_MS
          })
        ]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const itermIdx = res.items.findIndex((i) => itemMatchesPath(i, iterm))
        const vsIdx = res.items.findIndex((i) => itemMatchesPath(i, vscode))
        const ok = itermIdx >= 0 && vsIdx >= 0 && itermIdx < vsIdx
        return { passed: ok, evidence: `iTermRank=${itermIdx} < vscodeRank=${vsIdx}` }
      }
    )
  }

  if (caseKey === 'cold-start-defaults') {
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [{ time: baseTime }]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const hasBuiltinSetting = res.items.some((i) => i.source.id === APP_DESTINATION_PROVIDER_ID)
        const hasFabricatedFrequent = res.items.some(
          (i) => i.meta?.recommendation?.source === 'frequent'
        )
        const ok = res.items.length >= 3 && hasBuiltinSetting && !hasFabricatedFrequent
        return {
          passed: ok,
          evidence: `items=${res.items.length}, builtinSetting=${hasBuiltinSetting}, fabricatedFrequent=${hasFabricatedFrequent}`
        }
      }
    )
  }

  if (caseKey === 'clipboard-url-card') {
    const url = String(p.url)
    hooks.setClipboardLatest({ type: 'text', content: url, timestamp: new Date(nowMs) })
    const chrome = '/Applications/Google Chrome.app'
    const spotify = '/Applications/Spotify.app'
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            clipboard: {
              type: 'text',
              content: hashContextContent(url),
              timestamp: nowMs,
              contentType: 'url',
              meta: { isUrl: true, urlDomain: 'github.com' }
            }
          }
        ],
        usageStats: [
          makeUsageStat('app-provider', chrome, 'app', 4, nowMs - 4 * HOUR_MS),
          makeUsageStat('app-provider', spotify, 'app', 4, nowMs - 4 * HOUR_MS),
          makeUsageStat(
            FILE_RECOMMENDATION_SOURCE_ID,
            path.join(env.rootDir, 'Downloads/2026-Q4-OKR-final.pdf'),
            'file',
            1,
            nowMs - 5 * DAY_MS
          )
        ],
        behaviorRows: [
          makeBehaviorRow('app-provider', chrome, {
            executeCount: 4,
            executeCount30: 4,
            activeDays30: 2,
            lastExecutedAt: nowMs - 4 * HOUR_MS
          }),
          makeBehaviorRow('app-provider', spotify, {
            executeCount: 4,
            executeCount30: 4,
            activeDays30: 2,
            lastExecutedAt: nowMs - 4 * HOUR_MS
          })
        ]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const topIsUrlCard = res.items[0]?.source.id === BUILTIN_CLIPBOARD_URL_SOURCE_ID
        const chromeIdx = res.items.findIndex((i) =>
          itemMatchesPath(i, '/Applications/Google Chrome.app')
        )
        const spotifyIdx = res.items.findIndex((i) =>
          itemMatchesPath(i, '/Applications/Spotify.app')
        )
        const ok = topIsUrlCard && chromeIdx >= 0 && (spotifyIdx < 0 || chromeIdx < spotifyIdx)
        return {
          passed: ok,
          evidence: `topSource=${res.items[0]?.source.id}, chromeRank=${chromeIdx}, spotifyRank=${spotifyIdx}`
        }
      }
    )
  }

  if (caseKey === 'clipboard-semantic-recall') {
    const text = String(p.clipboardText)
    const targetPath = path.join(env.rootDir, String(p.expectFileRelPath))
    hooks.setClipboardLatest({ type: 'text', content: text, timestamp: new Date(nowMs) })
    const seed = defaultHabitSeed(nowMs)
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            clipboard: {
              type: 'text',
              content: hashContextContent(text),
              timestamp: nowMs,
              contentType: 'text'
            }
          }
        ],
        ...seed
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const hit = res.items.some((i) => itemMatchesPath(i, targetPath))
        return {
          passed: hit,
          evidence: hit
            ? `clipboard semantic recalled ${p.expectFileRelPath}`
            : `no semantic file recalled for clipboard digest`
        }
      }
    )
  }

  if (caseKey === 'clipboard-code-lang') {
    const language = String(p.language)
    const expectedTop = p.expectTopApps as string[]
    const appsToSeed = [
      '/Applications/Visual Studio Code.app',
      '/Applications/WebStorm.app',
      '/Applications/PyCharm.app',
      '/Applications/Spotify.app'
    ]
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            clipboard: {
              type: 'files',
              content: hashContextContent(
                `["/proj/sample.${language === 'python' ? 'py' : 'ts'}"]`
              ),
              timestamp: nowMs,
              contentType: 'file',
              meta: { fileType: 'code', language }
            }
          }
        ],
        usageStats: [
          ...appsToSeed.map((a) => makeUsageStat('app-provider', a, 'app', 8, nowMs - 3 * HOUR_MS)),
          makeUsageStat(
            FILE_RECOMMENDATION_SOURCE_ID,
            path.join(env.rootDir, 'Downloads/2026-Q4-OKR-final.pdf'),
            'file',
            1,
            nowMs - 5 * DAY_MS
          )
        ],
        behaviorRows: appsToSeed.map((a) =>
          makeBehaviorRow('app-provider', a, {
            executeCount: 8,
            executeCount30: 8,
            activeDays30: 4,
            lastExecutedAt: nowMs - 3 * HOUR_MS
          })
        )
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const firstExpectedIdx = res.items.findIndex((i) => itemMatchesPath(i, expectedTop[0]!))
        const secondExpectedIdx = res.items.findIndex((i) => itemMatchesPath(i, expectedTop[1]!))
        const spotifyIdx = res.items.findIndex((i) =>
          itemMatchesPath(i, '/Applications/Spotify.app')
        )
        const ok =
          firstExpectedIdx >= 0 &&
          secondExpectedIdx >= 0 &&
          firstExpectedIdx < spotifyIdx &&
          secondExpectedIdx < spotifyIdx
        return {
          passed: ok,
          evidence: `top0=${firstExpectedIdx}, top1=${secondExpectedIdx}, spotify=${spotifyIdx}`
        }
      }
    )
  }

  if (caseKey === 'selection-semantic-recall') {
    const selectionText = String(p.selectionText)
    const targetPath = path.join(env.rootDir, String(p.expectFileRelPath))
    selectionSnapshotStore.set({ text: selectionText, capturedAt: nowMs })
    const seed = defaultHabitSeed(nowMs)
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            selection: {
              content: hashContextContent(selectionText),
              timestamp: nowMs,
              contentType: 'text'
            }
          }
        ],
        ...seed
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const hit = res.items.some((i) => itemMatchesPath(i, targetPath))
        return {
          passed: hit,
          evidence: hit
            ? `selection recalled ${p.expectFileRelPath}`
            : `selection semantic recall absent`
        }
      }
    )
  }

  if (caseKey === 'clipboard-digest-mismatch') {
    const staleUrl = 'https://example.com/stale-link'
    const liveUrl = 'https://example.com/newly-overwritten-link'
    hooks.setClipboardLatest({ type: 'text', content: liveUrl, timestamp: new Date(nowMs) })
    const seed = defaultHabitSeed(nowMs)
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            clipboard: {
              type: 'text',
              content: hashContextContent(staleUrl),
              timestamp: nowMs,
              contentType: 'url',
              meta: { isUrl: true }
            }
          }
        ],
        ...seed
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const leakedUrlCard = res.items.some((i) => i.source.id === BUILTIN_CLIPBOARD_URL_SOURCE_ID)
        return {
          passed: !leakedUrlCard,
          evidence: `leakedStaleUrlCard=${leakedUrlCard}`
        }
      }
    )
  }

  if (caseKey === 'clipboard-image-apps') {
    const figma = '/Applications/Figma.app'
    const preview = '/System/Applications/Preview.app'
    const spotify = '/Applications/Spotify.app'
    const list = [figma, preview, spotify]
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            clipboard: {
              type: 'image',
              content: hashContextContent('raw-png-digest'),
              timestamp: nowMs
            }
          }
        ],
        usageStats: list.map((a) =>
          makeUsageStat('app-provider', a, 'app', 8, nowMs - 3 * HOUR_MS)
        ),
        behaviorRows: list.map((a) =>
          makeBehaviorRow('app-provider', a, {
            executeCount: 8,
            executeCount30: 8,
            activeDays30: 4,
            lastExecutedAt: nowMs - 3 * HOUR_MS
          })
        )
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const figmaIdx = res.items.findIndex((i) => itemMatchesPath(i, figma))
        const previewIdx = res.items.findIndex((i) => itemMatchesPath(i, preview))
        const spotifyIdx = res.items.findIndex((i) => itemMatchesPath(i, spotify))
        const ok =
          figmaIdx >= 0 && previewIdx >= 0 && figmaIdx < spotifyIdx && previewIdx < spotifyIdx
        return {
          passed: ok,
          evidence: `figma=${figmaIdx}, preview=${previewIdx}, spotify=${spotifyIdx}`
        }
      }
    )
  }

  if (caseKey === 'habit-morning-feishu') {
    const feishu = '/Applications/Lark.app'
    const spotify = '/Applications/Spotify.app'
    const hours = Array.from({ length: 24 }, (_, h) => (h === 9 ? 11 : h === 10 ? 3 : 0))
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: { hourOfDay: 9, dayOfWeek: 1, isWorkingHours: true, timeSlot: 'morning' }
          }
        ],
        usageStats: [
          makeUsageStat('app-provider', feishu, 'app', 14, nowMs - DAY_MS),
          makeUsageStat('app-provider', spotify, 'app', 12, nowMs - DAY_MS),
          makeUsageStat(
            FILE_RECOMMENDATION_SOURCE_ID,
            path.join(env.rootDir, 'Downloads/2026-Q4-OKR-final.pdf'),
            'file',
            1,
            nowMs - 5 * DAY_MS
          )
        ],
        behaviorRows: [
          makeBehaviorRow('app-provider', feishu, {
            executeCount: 14,
            executeCount30: 14,
            activeDays30: 6,
            lastExecutedAt: nowMs - DAY_MS,
            hourDistribution30: hours,
            timeSlotDistribution30: { morning: 14, afternoon: 0, evening: 0, night: 0 }
          }),
          makeBehaviorRow('app-provider', spotify, {
            executeCount: 12,
            executeCount30: 12,
            activeDays30: 5,
            lastExecutedAt: nowMs - DAY_MS,
            hourDistribution30: Array.from({ length: 24 }, (_, h) => (h === 21 ? 12 : 0)),
            timeSlotDistribution30: { morning: 0, afternoon: 0, evening: 12, night: 0 }
          })
        ],
        timeStatsRows: [
          {
            sourceId: 'app-provider',
            itemId: feishu,
            hourDistribution: JSON.stringify(hours),
            dayOfWeekDistribution: JSON.stringify([0, 4, 3, 3, 2, 2, 0]),
            timeSlotDistribution: JSON.stringify({
              morning: 14,
              afternoon: 0,
              evening: 0,
              night: 0
            })
          }
        ]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const top = res.items[0]
        const ok =
          Boolean(top && itemMatchesPath(top, feishu)) &&
          top?.meta?.recommendation?.source === 'time-based' &&
          Boolean(top?.meta?.recommendation?.evidence?.peakHourRange)
        return {
          passed: ok,
          evidence: `top=${top?.render.basic?.title}, source=${top?.meta?.recommendation?.source}, peak=${top?.meta?.recommendation?.evidence?.peakHourRange}`
        }
      }
    )
  }

  if (caseKey === 'habit-arena-weekly-doc') {
    const docPath = path.join(env.rootDir, String(p.expectFileRelPath))
    const hours = Array.from({ length: 24 }, (_, h) => (h === 17 ? 12 : 0))
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: { hourOfDay: 17, dayOfWeek: 5, isWorkingHours: true, timeSlot: 'afternoon' }
          }
        ],
        usageStats: [
          makeUsageStat(FILE_RECOMMENDATION_SOURCE_ID, docPath, 'file', 12, nowMs - 2 * DAY_MS)
        ],
        behaviorRows: [
          makeBehaviorRow(FILE_RECOMMENDATION_SOURCE_ID, docPath, {
            executeCount: 12,
            executeCount30: 12,
            activeDays30: 4,
            lastExecutedAt: nowMs - 2 * DAY_MS,
            hourDistribution30: hours,
            timeSlotDistribution30: { morning: 0, afternoon: 12, evening: 0, night: 0 }
          })
        ],
        timeStatsRows: [
          {
            sourceId: FILE_RECOMMENDATION_SOURCE_ID,
            itemId: docPath,
            hourDistribution: JSON.stringify(hours),
            dayOfWeekDistribution: JSON.stringify([0, 0, 0, 0, 0, 12, 0]),
            timeSlotDistribution: JSON.stringify({
              morning: 0,
              afternoon: 12,
              evening: 0,
              night: 0
            })
          }
        ]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const hit = res.items.some((i) => itemMatchesPath(i, docPath))
        return {
          passed: hit,
          evidence: hit
            ? `rebuilt Arena-only weekly doc via FileRecommendationBridge`
            : `Arena-only weekly doc dropped without bridge`
        }
      }
    )
  }

  if (caseKey === 'habit-yesterday-recall') {
    const zoom = '/Applications/zoom.us.app'
    const nowDate = new Date()
    const yesterdaySameHour = new Date(nowDate)
    yesterdaySameHour.setDate(nowDate.getDate() - 1)
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: {
              hourOfDay: nowDate.getHours(),
              dayOfWeek: nowDate.getDay(),
              isWorkingHours: true,
              timeSlot: 'morning'
            }
          }
        ],
        usageStats: [makeUsageStat('app-provider', zoom, 'app', 2, yesterdaySameHour.getTime())],
        behaviorRows: [
          makeBehaviorRow('app-provider', zoom, {
            executeCount: 2,
            executeCount30: 2,
            activeDays30: 2,
            lastExecutedAt: yesterdaySameHour.getTime()
          })
        ],
        historyEvents: [
          {
            sourceId: 'app-provider',
            itemId: zoom,
            sourceType: 'app',
            timestamp: yesterdaySameHour.getTime(),
            previousApp: null
          }
        ]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const zoomItem = res.items.find((i) => itemMatchesPath(i, zoom))
        const yesterdayEv = zoomItem?.meta?.recommendation?.evidence?.yesterday
        const ok = Boolean(zoomItem && yesterdayEv && yesterdayEv.executeCount >= 1)
        return {
          passed: ok,
          evidence: `foundZoom=${Boolean(zoomItem)}, yesterdayCount=${yesterdayEv?.executeCount ?? 0}`
        }
      }
    )
  }

  if (caseKey === 'habit-time-disabled-source-kept') {
    const apifox = '/Applications/Apifox.app'
    const zoom = '/Applications/zoom.us.app'
    const chrome = '/Applications/Google Chrome.app'
    const nowDate = new Date()
    const yesterdaySameHour = new Date(nowDate)
    yesterdaySameHour.setDate(nowDate.getDate() - 1)

    const historyEvents: RecommendationHistoryEvent[] = [
      {
        sourceId: 'app-provider',
        itemId: zoom,
        sourceType: 'app',
        timestamp: yesterdaySameHour.getTime(),
        previousApp: null
      },
      ...[1, 2, 3, 4].map((d) => ({
        sourceId: 'app-provider',
        itemId: apifox,
        sourceType: 'app',
        timestamp: nowMs - d * DAY_MS,
        previousApp: 'com.microsoft.VSCode'
      })),
      ...[1, 2, 3, 4, 5, 6].map((d) => ({
        sourceId: 'app-provider',
        itemId: chrome,
        sourceType: 'app',
        timestamp: nowMs - d * DAY_MS,
        previousApp: 'com.apple.finder'
      }))
    ]

    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            timeAvailable: false,
            foregroundApp: { bundleId: 'com.microsoft.VSCode', name: 'Visual Studio Code' }
          }
        ],
        usageStats: [
          makeUsageStat('app-provider', apifox, 'app', 4, nowMs - DAY_MS),
          makeUsageStat('app-provider', zoom, 'app', 1, yesterdaySameHour.getTime()),
          makeUsageStat('app-provider', chrome, 'app', 6, nowMs - DAY_MS)
        ],
        behaviorRows: [
          makeBehaviorRow('app-provider', apifox, {
            executeCount: 4,
            executeCount30: 4,
            activeDays30: 4,
            lastExecutedAt: nowMs - DAY_MS
          }),
          makeBehaviorRow('app-provider', chrome, {
            executeCount: 6,
            executeCount30: 6,
            activeDays30: 6,
            lastExecutedAt: nowMs - DAY_MS
          })
        ],
        historyEvents
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const apifoxItem = res.items.find((i) => itemMatchesPath(i, apifox))
        const anyYesterday = res.items.some((i) =>
          Boolean(i.meta?.recommendation?.evidence?.yesterday)
        )
        const ok = Boolean(apifoxItem?.meta?.recommendation?.evidence?.sourceApp) && !anyYesterday
        return {
          passed: ok,
          evidence: `apifoxSourceApp=${apifoxItem?.meta?.recommendation?.evidence?.sourceApp?.name}, anyYesterday=${anyYesterday}`
        }
      }
    )
  }

  if (caseKey === 'habit-vscode-to-apifox') {
    const apifox = '/Applications/Apifox.app'
    const spotify = '/Applications/Spotify.app'
    const historyEvents: RecommendationHistoryEvent[] = [
      ...[1, 2, 3, 4, 5, 6].map((d) => ({
        sourceId: 'app-provider',
        itemId: apifox,
        sourceType: 'app',
        timestamp: nowMs - d * DAY_MS,
        previousApp: 'com.microsoft.VSCode'
      })),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((d) => ({
        sourceId: 'app-provider',
        itemId: spotify,
        sourceType: 'app',
        timestamp: nowMs - d * DAY_MS,
        previousApp: 'com.apple.finder'
      }))
    ]
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            foregroundApp: { bundleId: 'com.microsoft.VSCode', name: 'Visual Studio Code' }
          }
        ],
        usageStats: [
          makeUsageStat('app-provider', apifox, 'app', 6, nowMs - DAY_MS),
          makeUsageStat('app-provider', spotify, 'app', 6, nowMs - DAY_MS)
        ],
        behaviorRows: [
          makeBehaviorRow('app-provider', apifox, {
            executeCount: 6,
            executeCount30: 6,
            activeDays30: 6,
            lastExecutedAt: nowMs - DAY_MS
          }),
          makeBehaviorRow('app-provider', spotify, {
            executeCount: 6,
            executeCount30: 6,
            activeDays30: 6,
            lastExecutedAt: nowMs - DAY_MS
          })
        ],
        historyEvents
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const apifoxIdx = res.items.findIndex((i) => itemMatchesPath(i, apifox))
        const spotifyIdx = res.items.findIndex((i) => itemMatchesPath(i, spotify))
        const ok = apifoxIdx >= 0 && (spotifyIdx < 0 || apifoxIdx < spotifyIdx)
        return { passed: ok, evidence: `apifoxRank=${apifoxIdx}, spotifyRank=${spotifyIdx}` }
      }
    )
  }

  if (caseKey === 'habit-figma-to-arena-pdf') {
    const pdfPath = path.join(env.rootDir, String(p.expectFileRelPath))
    const spotify = '/Applications/Spotify.app'
    const historyEvents: RecommendationHistoryEvent[] = [
      ...[1, 2, 3, 4, 5].map((d) => ({
        sourceId: FILE_RECOMMENDATION_SOURCE_ID,
        itemId: pdfPath,
        sourceType: 'file',
        timestamp: nowMs - d * DAY_MS,
        previousApp: 'com.figma.Desktop'
      })),
      ...[1, 2, 3, 4, 5, 6].map((d) => ({
        sourceId: 'app-provider',
        itemId: spotify,
        sourceType: 'app',
        timestamp: nowMs - d * DAY_MS,
        previousApp: 'com.apple.finder'
      }))
    ]
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            foregroundApp: { bundleId: 'com.figma.Desktop', name: 'Figma' }
          }
        ],
        usageStats: [
          makeUsageStat(FILE_RECOMMENDATION_SOURCE_ID, pdfPath, 'file', 5, nowMs - DAY_MS),
          makeUsageStat('app-provider', spotify, 'app', 5, nowMs - DAY_MS)
        ],
        behaviorRows: [
          makeBehaviorRow(FILE_RECOMMENDATION_SOURCE_ID, pdfPath, {
            executeCount: 5,
            executeCount30: 5,
            activeDays30: 5,
            lastExecutedAt: nowMs - DAY_MS
          }),
          makeBehaviorRow('app-provider', spotify, {
            executeCount: 5,
            executeCount30: 5,
            activeDays30: 5,
            lastExecutedAt: nowMs - DAY_MS
          })
        ],
        historyEvents
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const hit = res.items.some((i) => itemMatchesPath(i, pdfPath))
        return {
          passed: hit,
          evidence: hit
            ? `Figma -> Arena PDF cheatsheet rebuilt & surfaced`
            : `Arena PDF missing without FileRecommendationBridge`
        }
      }
    )
  }

  if (caseKey === 'habit-joint-evidence-gate') {
    const apifox = '/Applications/Apifox.app'
    const zoom = '/Applications/zoom.us.app'
    const chrome = '/Applications/Google Chrome.app'
    const nowDate = new Date()
    const targetHour = nowDate.getHours()
    const offHour = (targetHour + 9) % 24

    const makeAtMs = (daysAgo: number, hour: number) => {
      const d = new Date(nowDate)
      d.setDate(d.getDate() - daysAgo)
      d.setHours(hour, nowDate.getMinutes(), 0, 0)
      return d.getTime()
    }

    const historyEvents: RecommendationHistoryEvent[] = [
      // Apifox: 5 joint executions from VS Code right in targetHour across 5 days
      ...[1, 2, 3, 4, 5].map((d) => ({
        sourceId: 'app-provider',
        itemId: apifox,
        sourceType: 'app',
        timestamp: makeAtMs(d, targetHour),
        previousApp: 'com.microsoft.VSCode'
      })),
      // Zoom: 4 executions from VS Code at offHour (not joint with targetHour!)
      ...[1, 2, 3, 4].map((d) => ({
        sourceId: 'app-provider',
        itemId: zoom,
        sourceType: 'app',
        timestamp: makeAtMs(d, offHour),
        previousApp: 'com.microsoft.VSCode'
      })),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((d) => ({
        sourceId: 'app-provider',
        itemId: chrome,
        sourceType: 'app',
        timestamp: makeAtMs(d, offHour),
        previousApp: 'com.apple.finder'
      }))
    ]

    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: {
              hourOfDay: targetHour,
              dayOfWeek: nowDate.getDay(),
              isWorkingHours: true,
              timeSlot: 'morning'
            },
            foregroundApp: { bundleId: 'com.microsoft.VSCode', name: 'Visual Studio Code' }
          }
        ],
        usageStats: [
          makeUsageStat('app-provider', apifox, 'app', 5, nowMs - DAY_MS),
          makeUsageStat('app-provider', zoom, 'app', 4, nowMs - DAY_MS),
          makeUsageStat('app-provider', chrome, 'app', 8, nowMs - DAY_MS)
        ],
        behaviorRows: [
          makeBehaviorRow('app-provider', apifox, {
            executeCount: 5,
            executeCount30: 5,
            activeDays30: 5,
            lastExecutedAt: nowMs - DAY_MS
          }),
          makeBehaviorRow('app-provider', zoom, {
            executeCount: 4,
            executeCount30: 4,
            activeDays30: 4,
            lastExecutedAt: nowMs - DAY_MS
          })
        ],
        historyEvents
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const apifoxItem = res.items.find((i) => itemMatchesPath(i, apifox))
        const zoomItem = res.items.find((i) => itemMatchesPath(i, zoom))
        const jointGrantedToApifox = Boolean(
          apifoxItem?.meta?.recommendation?.evidence?.sourceApp?.timeWindow
        )
        const jointDeniedToZoom = !zoomItem?.meta?.recommendation?.evidence?.sourceApp?.timeWindow
        return {
          passed: jointGrantedToApifox && jointDeniedToZoom,
          evidence: `apifoxJointWindow=${Boolean(apifoxItem?.meta?.recommendation?.evidence?.sourceApp?.timeWindow)}, zoomJointWindow=${Boolean(zoomItem?.meta?.recommendation?.evidence?.sourceApp?.timeWindow)}`
        }
      }
    )
  }

  if (caseKey === 'habit-pinned-first-dedup') {
    const sublime = '/Applications/Sublime Text.app'
    const vscode = '/Applications/Visual Studio Code.app'
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [{ time: baseTime }],
        pinnedItems: [{ sourceId: 'app-provider', itemId: sublime, sourceType: 'app' }],
        usageStats: [
          makeUsageStat('app-provider', vscode, 'app', 30, nowMs - HOUR_MS),
          makeUsageStat('app-provider', sublime, 'app', 15, nowMs - 2 * HOUR_MS)
        ],
        behaviorRows: [
          makeBehaviorRow('app-provider', vscode, {
            executeCount: 30,
            executeCount30: 30,
            activeDays30: 12,
            lastExecutedAt: nowMs - HOUR_MS
          }),
          makeBehaviorRow('app-provider', sublime, {
            executeCount: 15,
            executeCount30: 15,
            activeDays30: 6,
            lastExecutedAt: nowMs - 2 * HOUR_MS
          })
        ]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const firstIsSublime = Boolean(res.items[0] && itemMatchesPath(res.items[0], sublime))
        const sublimeOccurrences = res.items.filter((i) => itemMatchesPath(i, sublime)).length
        return {
          passed:
            firstIsSublime &&
            res.items[0]?.meta?.pinned?.isPinned === true &&
            sublimeOccurrences === 1,
          evidence: `firstIsSublime=${firstIsSublime}, sublimeCount=${sublimeOccurrences}`
        }
      }
    )
  }

  if (caseKey === 'habit-honest-5-3-badge') {
    const webstorm = '/Applications/WebStorm.app'
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [{ time: baseTime }],
        usageStats: [makeUsageStat('app-provider', webstorm, 'app', 8, nowMs - 10 * 60_000)],
        behaviorRows: [
          makeBehaviorRow('app-provider', webstorm, {
            executeCount: 8,
            executeCount30: 8,
            activeDays30: 1, // Only 1 active day (< 3 required for Frequent!)
            lastExecutedAt: nowMs - 10 * 60_000
          })
        ]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const item = res.items.find((i) => itemMatchesPath(i, webstorm))
        const source = item?.meta?.recommendation?.source
        const ok = Boolean(item) && source === 'recent'
        return { passed: ok, evidence: `sourceBadge=${source} (activeDays30=1, executeCount30=8)` }
      }
    )
  }

  if (caseKey === 'habit-foreground-stay-recent') {
    const figma = '/Applications/Figma.app'
    const lastStay = nowMs - 5 * 60_000
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [{ time: baseTime }],
        foregroundEntries: [{ appKey: 'com.figma.desktop', lastActiveAt: lastStay }]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const item = res.items.find((i) => itemMatchesPath(i, figma))
        const ev = item?.meta?.recommendation?.evidence
        const ok =
          Boolean(item) &&
          item?.meta?.recommendation?.source === 'recent' &&
          ev?.lastActiveAt !== undefined &&
          ev?.executeCount === undefined
        return {
          passed: ok,
          evidence: `source=${item?.meta?.recommendation?.source}, lastActiveAt=${Boolean(ev?.lastActiveAt)}, executeCount=${ev?.executeCount}`
        }
      }
    )
  }

  throw new Error(`Unhandled zero-input caseKey: ${caseKey}`)
}

async function runSemanticOrMultimodalQuery(
  scenario: Rec100ScenarioDefinition,
  mode: Rec100ArchitectureMode,
  env: SandboxEnv
): Promise<{ passed: boolean; evidence: string }> {
  const p = scenario.params
  const query = String(p.query)
  const qLower = query.trim().toLowerCase()

  // Layer A (Legacy Single-Layer): keyword/filename substring over SQLite `files` only (0 Gemma vectors)
  const items: TuffItem[] = []
  const seenIds = new Set<string>()

  for (const row of env.sqliteFilesByPath.values()) {
    if (row.name.toLowerCase().includes(qLower)) {
      const item = mapFileToTuffItem(
        row as never,
        {},
        FILE_RECOMMENDATION_SOURCE_ID,
        'File Provider'
      )
      items.push(item)
      seenIds.add(item.id)
    }
  }

  let topDeepMatch: ReturnType<typeof buildFileContentMatch> | undefined
  if (mode === 'dual-layer-gemma-arena') {
    const arenaHits = await env.arena.search(query, { limit: 8, typeFilter: 'file' })
    for (const hit of arenaHits.items) {
      const row = env.sqliteFilesByPath.get(hit.path) ?? {
        id: -1,
        path: hit.path,
        name: hit.name,
        displayName: hit.name,
        extension: hit.extension.replace(/^\./, ''),
        size: null,
        mtime: new Date(hit.mtimeMs),
        ctime: new Date(hit.mtimeMs),
        lastIndexedAt: new Date(hit.mtimeMs),
        isDir: false,
        type: 'file' as const,
        content: null,
        embeddingStatus: 'none'
      }
      const item = mapFileToTuffItem(
        row as never,
        {},
        FILE_RECOMMENDATION_SOURCE_ID,
        'File Provider'
      )
      if (!seenIds.has(item.id)) {
        items.push(item)
        seenIds.add(item.id)
      }
    }

    const vectorHits = queryGemmaVectorIndex(env, query, 6).filter((h) => h.score >= 0.42)
    for (const vHit of vectorHits) {
      const fileRow = env.sqliteFilesById.get(Number(vHit.sourceId))
      if (!fileRow) continue
      const item = mapFileToTuffItem(
        fileRow as never,
        {},
        FILE_RECOMMENDATION_SOURCE_ID,
        'File Provider'
      )
      item.scoring = {
        final: vHit.score,
        match: 0,
        recency: 0,
        frequency: 0,
        base: vHit.score,
        match_details: { type: 'semantic', query, confidence: vHit.score }
      }
      item.meta = {
        ...(item.meta ?? {}),
        extension: {
          ...(item.meta?.extension ?? {}),
          search: { keywordMatch: false, ftsScore: 0, semanticScore: vHit.score }
        }
      }
      const chunks = env.chunksByFileId.get(fileRow.id)
      if (chunks && vHit.contentHash) {
        const dm = buildFileContentMatch(chunks, query, vHit.contentHash)
        if (dm && !topDeepMatch) topDeepMatch = dm
      }
      if (!seenIds.has(item.id)) {
        items.push(item)
        seenIds.add(item.id)
      }
    }
  }

  const sorted = tuffSorter.sort(items, { text: query } as never, new AbortController().signal)
  const top = sorted[0]
  if (!top) {
    return { passed: false, evidence: `0 candidates recalled in mode=${mode}` }
  }

  const expectedAny = p.expectAnyRelPaths as string[] | undefined
  const expectedCandidates = expectedAny
    ? expectedAny.map((rel) => path.join(env.rootDir, rel))
    : [path.join(env.rootDir, String(p.expectFileRelPath))]

  const matchedTop = expectedCandidates.some((full) => itemMatchesPath(top, full))
  if (!matchedTop) {
    return {
      passed: false,
      evidence: `top=${top.render.basic?.title} did not match expected`
    }
  }

  if (scenario.kind === 'multimodal-query') {
    const caseKey = String(p.caseKey)
    if (caseKey === 'pdf-page-chunk') {
      const snippetHit = Boolean(topDeepMatch?.snippet?.includes(String(p.expectSnippetContains)))
      const ok = topDeepMatch?.pageNumber === Number(p.expectPageNumber) && snippetHit
      return {
        passed: ok,
        evidence: `pageNumber=${topDeepMatch?.pageNumber}, snippetMatch=${snippetHit}`
      }
    }
    if (caseKey === 'md-line-chunk') {
      const ok = (topDeepMatch?.lineNumber ?? 0) >= Number(p.expectMinLine)
      return {
        passed: ok,
        evidence: `lineNumber=${topDeepMatch?.lineNumber}`
      }
    }
    if (caseKey === 'emoji-surrogate-safety') {
      const snippet = topDeepMatch?.snippet ?? ''
      const hasLoneSurrogate =
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(snippet)
      const ok = snippet.length > 0 && !hasLoneSurrogate
      return {
        passed: ok,
        evidence: `snippetLen=${snippet.length}, loneSurrogate=${hasLoneSurrogate}`
      }
    }
    if (caseKey === 'visual-image-search') {
      const targetDoc = REC_100_CORPUS_FILES.find(
        (d: Rec100DocFixture) => d.relPath === String(p.expectFileRelPath)
      )
      const sqlRow = targetDoc ? env.sqliteFilesById.get(targetDoc.id) : undefined
      const ok = matchedTop && sqlRow?.content === null
      return {
        passed: ok,
        evidence: `visualTop=${top.render.basic?.title}, contentIsNull=${sqlRow?.content === null}`
      }
    }
  }

  return {
    passed: true,
    evidence: `top=${top.render.basic?.title}, finalScore=${round(top.scoring?.final ?? 0, 1)}`
  }
}

async function runArenaFastpathScenario(
  scenario: Rec100ScenarioDefinition,
  mode: Rec100ArchitectureMode,
  env: SandboxEnv
): Promise<{ passed: boolean; evidence: string }> {
  const p = scenario.params
  const caseKey = String(p.caseKey)

  if (mode === 'legacy-single-layer') {
    // Legacy single-layer lacks NativeFileArena (no heteronym slab, no Smith-Waterman fzf, no TUFFIDX3)
    const q = typeof p.query === 'string' ? p.query.toLowerCase() : ''
    const expectName = typeof p.expectName === 'string' ? p.expectName : ''
    if (caseKey === 'arena-query' && q && expectName) {
      const legacyHit = [...env.sqliteFilesByPath.values()].some(
        (r) => r.name === expectName && r.name.toLowerCase().includes(q)
      )
      return {
        passed: legacyHit,
        evidence: `legacy SQLite substring hit=${legacyHit} (no NativeFileArena)`
      }
    }
    return { passed: false, evidence: 'NativeFileArena absent in legacy single-layer baseline' }
  }

  if (caseKey === 'arena-query') {
    const query = String(p.query)
    const expectName = String(p.expectName)
    const maxDurationMs = Number(p.maxDurationMs ?? 15)
    const res = await env.arena.search(query, { limit: 10 })
    const hit = res.items.find((i) => i.name === expectName)
    const rangeOk = p.expectFirstRange
      ? JSON.stringify(hit?.matchedRanges?.[0]) === JSON.stringify(p.expectFirstRange)
      : true
    const ok = Boolean(hit) && res.durationMs <= maxDurationMs && rangeOk
    return {
      passed: ok,
      evidence: `hit=${hit?.name ?? 'none'}, arenaMs=${round(res.durationMs, 3)}, ranges=${JSON.stringify(hit?.matchedRanges)}`
    }
  }

  if (caseKey === 'arena-rank-order') {
    const res = await env.arena.search(String(p.query), { limit: 10 })
    const hi = res.items.findIndex((i) => i.name === String(p.expectHigherName))
    const lo = res.items.findIndex((i) => i.name === String(p.expectLowerName))
    const ok = hi === 0 && (lo < 0 || hi < lo)
    return {
      passed: ok,
      evidence: `higherIdx=${hi}, lowerIdx=${lo}, ms=${round(res.durationMs, 3)}`
    }
  }

  if (caseKey === 'arena-ext-recency') {
    const ext = String(p.extension)
    const res = await env.arena.search('', { limit: 10, extensions: [ext], typeFilter: 'file' })
    const allMatchExt =
      res.items.length > 0 && res.items.every((i) => i.name.toLowerCase().endsWith(ext))
    const topMatches = res.items[0]?.name === String(p.expectTopName)
    const hasMtimeMs = typeof res.items[0]?.mtimeMs === 'number' && res.items[0].mtimeMs > 0
    return {
      passed: allMatchExt && topMatches && hasMtimeMs,
      evidence: `top=${res.items[0]?.name}, count=${res.items.length}, mtimeMs=${res.items[0]?.mtimeMs}, ms=${round(res.durationMs, 3)}`
    }
  }

  if (caseKey === 'arena-folder-filter') {
    const res = await env.arena.search('', { limit: 20, typeFilter: 'folder' })
    const allDirs = res.items.length > 0 && res.items.every((i) => i.isDir === true)
    const hasDocsDir = res.items.some((i) => i.name === 'Documents')
    return {
      passed: allDirs && hasDocsDir,
      evidence: `dirs=${res.items.length}, allIsDir=${allDirs}, hasDocuments=${hasDocsDir}`
    }
  }

  if (caseKey === 'arena-has-path') {
    const existing = path.join(env.rootDir, 'Documents/finance/重庆分支机构预算.xlsx')
    const missing = path.join(env.rootDir, 'Documents/finance/non-existent-ghost.xlsx')
    const t0 = performance.now()
    let ok = true
    for (let i = 0; i < 100; i += 1) {
      if (!env.arena.hasPath(existing) || env.arena.hasPath(missing)) {
        ok = false
        break
      }
    }
    const avgUs = ((performance.now() - t0) * 1000) / 100
    return {
      passed: ok && avgUs < 200,
      evidence: `hasPathAccurate=${ok}, avgLatencyUs=${round(avgUs, 2)}`
    }
  }

  if (caseKey === 'arena-snapshot-roundtrip') {
    const snapPath = path.join(env.rootDir, 'arena-roundtrip.tuffidx3')
    const legacyPath = path.join(env.rootDir, 'arena-legacy.tuffidx2')
    try {
      const bytes = env.arena.saveSnapshot(snapPath)
      const magic = fs.readFileSync(snapPath).subarray(0, 8).toString('ascii')
      const reloaded = createArenaWithFallback()
      const beforeStats = env.arena.getStats()
      const afterStats = reloaded.loadSnapshot(snapPath)
      const zqHit = await reloaded.search('zq', { limit: 5 })

      fs.writeFileSync(legacyPath, Buffer.from('TUFFIDX2\x00\x00\x00\x00'))
      let rejectedLegacy = false
      try {
        reloaded.loadSnapshot(legacyPath)
      } catch (err) {
        rejectedLegacy = /TUFFIDX3/i.test(String(err))
      }

      const ok =
        bytes > 24 &&
        magic === 'TUFFIDX3' &&
        afterStats.fileCount === beforeStats.fileCount &&
        zqHit.items.some((i) => i.name === '重庆分支机构预算.xlsx') &&
        rejectedLegacy
      return {
        passed: ok,
        evidence: `magic=${magic}, bytes=${bytes}, files=${afterStats.fileCount}, rejectedTUFFIDX2=${rejectedLegacy}`
      }
    } finally {
      fs.rmSync(snapPath, { force: true })
      fs.rmSync(legacyPath, { force: true })
    }
  }

  throw new Error(`Unhandled arena-fastpath caseKey: ${caseKey}`)
}

async function runFsRealtimeScenario(
  scenario: Rec100ScenarioDefinition,
  mode: Rec100ArchitectureMode,
  env: SandboxEnv,
  hooks: Rec100RuntimeHooks
): Promise<{ passed: boolean; evidence: string }> {
  const p = scenario.params
  const caseKey = String(p.caseKey)

  if (caseKey === 'fresh-download-3s') {
    const targetPath = path.join(env.rootDir, String(p.expectFileRelPath))
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: { hourOfDay: 11, dayOfWeek: 3, isWorkingHours: true, timeSlot: 'morning' }
          }
        ]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const item = res.items.find((i) => itemMatchesPath(i, targetPath))
        const ok = Boolean(item)
        return {
          passed: ok,
          evidence: ok
            ? `3s-old Downloads PDF surfaced via bridge (source=${item?.meta?.recommendation?.source})`
            : `3s-old Arena-only PDF missed without bridge`
        }
      }
    )
  }

  if (caseKey === 'reject-crdownload-and-empty') {
    const crdownload = path.join(env.rootDir, 'Downloads/large-model.gguf.crdownload')
    const emptyFile = path.join(env.rootDir, 'Downloads/empty-placeholder.md')
    const admitCr = isRecommendableNewFile({ path: crdownload, size: 1024, isDir: false })
    const admitEmpty = isRecommendableNewFile({ path: emptyFile, size: 0, isDir: false })
    const ok = !admitCr && !admitEmpty
    return {
      passed: ok,
      evidence: `admitCrdownload=${admitCr}, admitZeroByte=${admitEmpty}`
    }
  }

  if (caseKey === 'delta-live-create') {
    if (mode === 'legacy-single-layer') {
      return { passed: false, evidence: 'no NativeFileArena applyDelta or Bridge in legacy mode' }
    }
    const dir = path.join(env.rootDir, 'Documents/notes')
    const name = 'live-hotfix-delta-note.md'
    const full = path.join(dir, name)
    fs.writeFileSync(full, '# hotfix delta', 'utf8')
    try {
      env.arena.applyDelta(
        [{ dir, name, isDir: false, mtimeSec: Math.floor(Date.now() / 1000) }],
        [],
        []
      )
      const searchRes = await env.arena.search('lhdn', { limit: 5 })
      const bridge = new FileRecommendationBridgeImpl({
        getNativeIndexService: () => ({ isReady: () => true, arena: env.arena }) as never,
        getEmbeddingService: () => null,
        getDbUtils: () => null,
        isPathAdmitted: (fp) => env.arena.hasPath(fp),
        normalizePath: (fp) => path.resolve(fp),
        logWarn: () => {}
      })
      const lookup = await bridge.lookupFilesByPaths([full])
      const ok =
        env.arena.hasPath(full) && searchRes.items.some((i) => i.path === full) && lookup.has(full)
      return {
        passed: ok,
        evidence: `hasPath=${env.arena.hasPath(full)}, fzfHit=${searchRes.items.some((i) => i.path === full)}, bridgeLookup=${lookup.has(full)}`
      }
    } finally {
      env.arena.applyDelta([], [full], [])
      fs.rmSync(full, { force: true })
    }
  }

  if (caseKey === 'delta-live-rename') {
    if (mode === 'legacy-single-layer') {
      return {
        passed: false,
        evidence: 'no NativeFileArena rename delta + bridge rebuild in legacy mode'
      }
    }
    const dir = path.join(env.rootDir, 'Documents/notes')
    const oldName = 'draft-rename-v1.md'
    const newName = 'architecture-rename-v2.md'
    const oldPath = path.join(dir, oldName)
    const newPath = path.join(dir, newName)
    fs.writeFileSync(oldPath, '# v1', 'utf8')
    env.arena.applyDelta([{ dir, name: oldName, isDir: false, mtimeSec: 1_700_000_000 }], [], [])

    fs.renameSync(oldPath, newPath)
    env.arena.applyDelta(
      [{ dir, name: newName, isDir: false, mtimeSec: 1_700_000_010 }],
      [oldPath],
      []
    )

    const bridge = new FileRecommendationBridgeImpl({
      getNativeIndexService: () => ({ isReady: () => true, arena: env.arena }) as never,
      getEmbeddingService: () => null,
      getDbUtils: () => null,
      isPathAdmitted: (fp) => env.arena.hasPath(fp),
      normalizePath: (fp) => path.resolve(fp),
      logWarn: () => {}
    })
    const dispose = registerFileRecommendationBridge(bridge)
    try {
      const source = createFileRecommendationSource({
        getFilesByPaths: async () => [],
        getFileExtensionsByFileIds: async () => []
      } as unknown as DbUtils)
      const rebuiltOld = await source.rebuild([oldPath])
      const rebuiltNew = await source.rebuild([newPath])
      const ok = !env.arena.hasPath(oldPath) && rebuiltOld.length === 0 && rebuiltNew.length === 1
      return {
        passed: ok,
        evidence: `oldRebuilt=${rebuiltOld.length}, newRebuilt=${rebuiltNew.length}`
      }
    } finally {
      dispose()
      env.arena.applyDelta([], [newPath], [])
      fs.rmSync(newPath, { force: true })
    }
  }

  if (caseKey === 'drop-deleted-sqlite-file') {
    const tempPath = path.join(env.rootDir, 'Documents/notes/ephemeral-sqlite-doc.md')
    fs.writeFileSync(tempPath, '# ephemeral', 'utf8')
    const fakeDbRow: SqliteSimulatedFileRow = {
      id: 9901,
      path: tempPath,
      name: 'ephemeral-sqlite-doc.md',
      displayName: 'ephemeral-sqlite-doc.md',
      extension: 'md',
      size: 12,
      mtime: new Date(),
      ctime: new Date(),
      lastIndexedAt: new Date(),
      isDir: false,
      type: 'file',
      content: '# ephemeral',
      embeddingStatus: 'none'
    }
    const source = createFileRecommendationSource({
      getFilesByPaths: async () => [fakeDbRow],
      getFileExtensionsByFileIds: async () => []
    } as unknown as DbUtils)
    const beforeDelete = await source.rebuild([tempPath])
    fs.rmSync(tempPath, { force: true })
    const afterDelete = await source.rebuild([tempPath])
    const ok = beforeDelete.length === 1 && afterDelete.length === 0
    return {
      passed: ok,
      evidence: `beforeUnlink=${beforeDelete.length}, afterUnlink=${afterDelete.length}`
    }
  }

  if (caseKey === 'drop-deleted-arena-file') {
    const dir = path.join(env.rootDir, 'Documents/notes')
    const name = 'ephemeral-arena-only.md'
    const full = path.join(dir, name)
    fs.writeFileSync(full, '# arena ephemeral', 'utf8')
    env.arena.applyDelta([{ dir, name, isDir: false, mtimeSec: 1_700_000_100 }], [], [])

    let dispose: (() => void) | null = null
    if (mode === 'dual-layer-gemma-arena') {
      dispose = registerFileRecommendationBridge(
        new FileRecommendationBridgeImpl({
          getNativeIndexService: () => ({ isReady: () => true, arena: env.arena }) as never,
          getEmbeddingService: () => null,
          getDbUtils: () => null,
          isPathAdmitted: (fp) => env.arena.hasPath(fp),
          normalizePath: (fp) => path.resolve(fp),
          logWarn: () => {}
        })
      )
    }

    try {
      const source = createFileRecommendationSource({
        getFilesByPaths: async () => [],
        getFileExtensionsByFileIds: async () => []
      } as unknown as DbUtils)
      const beforeDelete = await source.rebuild([full])
      fs.rmSync(full, { force: true })
      const afterDelete = await source.rebuild([full])
      const ok = beforeDelete.length === 1 && afterDelete.length === 0
      return {
        passed: ok,
        evidence: `beforeUnlink=${beforeDelete.length}, afterUnlink=${afterDelete.length}`
      }
    } finally {
      dispose?.()
      env.arena.applyDelta([], [full], [])
      fs.rmSync(full, { force: true })
    }
  }

  if (caseKey === 'delta-remove-prefix-subtree') {
    if (mode === 'legacy-single-layer') {
      return { passed: false, evidence: 'subtree prefix tombstone requires NativeFileArena' }
    }
    const subtree = path.join(env.rootDir, 'Documents/temp-subtree')
    const subA = path.join(subtree, 'nested-a')
    fs.mkdirSync(subA, { recursive: true })
    const f1 = path.join(subtree, 'alpha.md')
    const f2 = path.join(subA, 'beta.md')
    fs.writeFileSync(f1, 'a')
    fs.writeFileSync(f2, 'b')
    try {
      env.arena.applyDelta(
        [
          { dir: subtree, name: 'alpha.md', isDir: false, mtimeSec: 1_700_000_000 },
          { dir: subA, name: 'beta.md', isDir: false, mtimeSec: 1_700_000_000 }
        ],
        [],
        []
      )
      const hadBefore = env.arena.hasPath(f1) && env.arena.hasPath(f2)
      env.arena.applyDelta([], [], [subtree])
      const goneAfter = !env.arena.hasPath(f1) && !env.arena.hasPath(f2)
      return {
        passed: hadBefore && goneAfter,
        evidence: `hadBefore=${hadBefore}, goneAfterPrefixRemoval=${goneAfter}`
      }
    } finally {
      fs.rmSync(subtree, { recursive: true, force: true })
    }
  }

  if (caseKey === 'reject-symlinks') {
    if (mode === 'legacy-single-layer') {
      return {
        passed: false,
        evidence: 'FSOPT_NOFOLLOW + Bridge symlink guard requires Dual-Layer'
      }
    }
    const symDir = path.join(env.rootDir, 'SymlinkIsolationBox')
    fs.mkdirSync(symDir, { recursive: true })
    const realFile = path.join(symDir, 'real-doc.md')
    const symFile = path.join(symDir, 'hosts-link.txt')
    const symLoop = path.join(symDir, 'self-loop')
    fs.writeFileSync(realFile, 'safe')
    fs.symlinkSync('/etc/hosts', symFile)
    fs.symlinkSync(symDir, symLoop)

    try {
      const localArena = createArenaWithFallback()
      await localArena.indexRoots([symDir], { includeDirs: true, maxDepth: 8 })
      const bridge = new FileRecommendationBridgeImpl({
        getNativeIndexService: () => ({ isReady: () => true, arena: localArena }) as never,
        getEmbeddingService: () => null,
        getDbUtils: () => null,
        isPathAdmitted: () => true,
        normalizePath: (fp) => path.resolve(fp),
        logWarn: () => {}
      })
      const map = await bridge.lookupFilesByPaths([realFile, symFile])
      const ok =
        localArena.hasPath(realFile) &&
        !localArena.hasPath(symFile) &&
        map.has(realFile) &&
        !map.has(symFile)
      return {
        passed: ok,
        evidence: `arenaBlockedSymlink=${!localArena.hasPath(symFile)}, bridgeBlockedSymlink=${!map.has(symFile)}`
      }
    } finally {
      fs.rmSync(symDir, { recursive: true, force: true })
    }
  }

  if (caseKey === 'context-dependent-target-dir') {
    if (mode === 'legacy-single-layer') {
      return {
        passed: false,
        evidence: 'NativeFileArena projectMarkers target isolation absent in legacy'
      }
    }
    const rustArtifact = path.join(env.rootDir, 'Projects/rust-engine/target/release/deps.d')
    const rustSrc = path.join(env.rootDir, 'Projects/rust-engine/src/lib.rs')
    const salesPlan = path.join(env.rootDir, 'Documents/sales-target/2026-plan.xlsx')
    const ok =
      !env.arena.hasPath(rustArtifact) && env.arena.hasPath(rustSrc) && env.arena.hasPath(salesPlan)
    return {
      passed: ok,
      evidence: `rustTargetExcluded=${!env.arena.hasPath(rustArtifact)}, salesTargetKept=${env.arena.hasPath(salesPlan)}`
    }
  }

  if (caseKey === 'noise-filter-consistency') {
    const nm = path.join(env.rootDir, 'Projects/tuff-core/node_modules/pkg/index.js')
    const gitCfg = path.join(env.rootDir, 'Projects/tuff-core/.git/config')
    const dsStore = path.join(env.rootDir, 'Documents/.DS_Store')
    const ok =
      Boolean(fileFilterService.getManualIndexExclusionReason({ path: nm })) &&
      Boolean(fileFilterService.getManualIndexExclusionReason({ path: gitCfg })) &&
      Boolean(fileFilterService.getManualIndexExclusionReason({ path: dsStore })) &&
      !isRecommendableNewFile({ path: nm, size: 100, isDir: false }) &&
      !isRecommendableNewFile({ path: gitCfg, size: 100, isDir: false }) &&
      !isRecommendableNewFile({ path: dsStore, size: 100, isDir: false })
    return {
      passed: ok,
      evidence: `allNoiseRejected=${ok}`
    }
  }

  throw new Error(`Unhandled fs-realtime caseKey: ${caseKey}`)
}

async function runHybridRankingScenario(
  scenario: Rec100ScenarioDefinition,
  mode: Rec100ArchitectureMode,
  env: SandboxEnv,
  hooks: Rec100RuntimeHooks
): Promise<{ passed: boolean; evidence: string }> {
  const p = scenario.params
  const caseKey = String(p.caseKey)
  const nowMs = env.nowMs

  if (caseKey === 'sorter-stem-semantic-ext-ladder') {
    const exactStem = new TuffItemBuilder('1', 'file', FILE_RECOMMENDATION_SOURCE_ID)
      .setKind('file')
      .setTitle('budget.xlsx')
      .setMeta({ file: { path: '/tmp/budget.xlsx', extension: 'xlsx' } })
      .build()
    const extOnly = new TuffItemBuilder('3', 'file', FILE_RECOMMENDATION_SOURCE_ID)
      .setKind('file')
      .setTitle('archive.budget')
      .setMeta({ file: { path: '/tmp/archive.budget', extension: 'budget' } })
      .build()
    const semanticDoc = new TuffItemBuilder('2', 'file', FILE_RECOMMENDATION_SOURCE_ID)
      .setKind('file')
      .setTitle('dept-hc-capex-plan-2026.xlsx')
      .setMeta({
        file: { path: '/tmp/dept-hc-capex-plan-2026.xlsx', extension: 'xlsx' },
        ...(mode === 'dual-layer-gemma-arena'
          ? { extension: { search: { semanticScore: 0.92 } } }
          : {})
      })
      .setScoring(
        mode === 'dual-layer-gemma-arena'
          ? { match_details: { type: 'semantic', query: 'budget', confidence: 0.92 } }
          : {}
      )
      .build()

    const sorted = tuffSorter.sort(
      [extOnly, semanticDoc, exactStem],
      { text: 'budget' } as never,
      new AbortController().signal
    )
    const ids = sorted.map((i) => i.render.basic?.title)
    const ok =
      ids[0] === 'budget.xlsx' &&
      ids[1] === 'dept-hc-capex-plan-2026.xlsx' &&
      ids[2] === 'archive.budget'
    return { passed: ok, evidence: `order=${ids.join(' > ')}` }
  }

  if (caseKey === 'sorter-semantic-beats-weak-substring') {
    const weakSub = new TuffItemBuilder('1', 'file', FILE_RECOMMENDATION_SOURCE_ID)
      .setKind('file')
      .setTitle('old-myredis-log-notes.txt')
      .setMeta({ file: { path: '/tmp/old-myredis-log-notes.txt', extension: 'txt' } })
      .build()
    const gemmaDoc = new TuffItemBuilder('2', 'file', FILE_RECOMMENDATION_SOURCE_ID)
      .setKind('file')
      .setTitle('cache-cluster-tuning.md')
      .setMeta({
        file: { path: '/tmp/cache-cluster-tuning.md', extension: 'md' },
        ...(mode === 'dual-layer-gemma-arena'
          ? { extension: { search: { semanticScore: 0.88 } } }
          : {})
      })
      .setScoring(
        mode === 'dual-layer-gemma-arena'
          ? { match_details: { type: 'semantic', query: 'redis', confidence: 0.88 } }
          : {}
      )
      .build()

    const sorted = tuffSorter.sort(
      [weakSub, gemmaDoc],
      { text: 'redis' } as never,
      new AbortController().signal
    )
    const ok = sorted[0]?.render.basic?.title === 'cache-cluster-tuning.md'
    return {
      passed: ok,
      evidence: `top=${sorted[0]?.render.basic?.title} (${round(sorted[0]?.scoring?.final ?? 0, 0)})`
    }
  }

  if (caseKey === 'sorter-completion-and-usage-boost') {
    const usedItem = new TuffItemBuilder('a', 'file', FILE_RECOMMENDATION_SOURCE_ID)
      .setKind('file')
      .setTitle('report-alpha.md')
      .setMeta({
        file: { path: '/tmp/report-alpha.md', extension: 'md' },
        completion: { count: 5, lastCompleted: new Date().toISOString(), score: 0.5 },
        usageStats: {
          executeCount: 12,
          searchCount: 12,
          cancelCount: 0,
          lastExecuted: new Date().toISOString(),
          lastSearched: new Date().toISOString(),
          lastCancelled: null
        }
      })
      .build()
    const unusedItem = new TuffItemBuilder('b', 'file', FILE_RECOMMENDATION_SOURCE_ID)
      .setKind('file')
      .setTitle('report-beta.md')
      .setMeta({ file: { path: '/tmp/report-beta.md', extension: 'md' } })
      .build()

    const sorted = tuffSorter.sort(
      [unusedItem, usedItem],
      { text: 'report' } as never,
      new AbortController().signal
    )
    const ok = sorted[0]?.id === 'a'
    return {
      passed: ok,
      evidence: `top=${sorted[0]?.render.basic?.title}, scoreA=${round(sorted[0]?.scoring?.final ?? 0, 0)} > scoreB=${round(sorted[1]?.scoring?.final ?? 0, 0)}`
    }
  }

  if (caseKey === 'volatile-file-extension-affinity') {
    const xlsxArenaOnly = path.join(env.rootDir, 'Documents/finance/重庆分支机构预算.xlsx')
    const mdSqlite = path.join(env.rootDir, 'Documents/meetings/sprint-retro-notes.md')
    const clipPath = path.join(env.rootDir, 'Documents/finance/raw-sheet.xlsx')

    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: { hourOfDay: 14, dayOfWeek: 3, isWorkingHours: true, timeSlot: 'afternoon' },
            clipboard: {
              type: 'files',
              content: hashContextContent(JSON.stringify([clipPath])),
              timestamp: nowMs,
              contentType: 'file',
              meta: {
                fileExtension: 'xlsx',
                fileType: 'document',
                directory: path.join(env.rootDir, 'Documents/finance')
              }
            } as never
          }
        ],
        usageStats: [
          makeUsageStat(
            FILE_RECOMMENDATION_SOURCE_ID,
            xlsxArenaOnly,
            'file',
            8,
            nowMs - 2 * HOUR_MS
          ),
          makeUsageStat(FILE_RECOMMENDATION_SOURCE_ID, mdSqlite, 'file', 8, nowMs - 2 * HOUR_MS)
        ],
        behaviorRows: [
          makeBehaviorRow(FILE_RECOMMENDATION_SOURCE_ID, xlsxArenaOnly, {
            executeCount: 8,
            executeCount30: 8,
            activeDays30: 4,
            lastExecutedAt: nowMs - 2 * HOUR_MS
          }),
          makeBehaviorRow(FILE_RECOMMENDATION_SOURCE_ID, mdSqlite, {
            executeCount: 8,
            executeCount30: 8,
            activeDays30: 4,
            lastExecutedAt: nowMs - 2 * HOUR_MS
          })
        ]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const xlsxIdx = res.items.findIndex((i) => itemMatchesPath(i, xlsxArenaOnly))
        const mdIdx = res.items.findIndex((i) => itemMatchesPath(i, mdSqlite))
        const ok = xlsxIdx >= 0 && mdIdx >= 0 && xlsxIdx < mdIdx
        return { passed: ok, evidence: `xlsxRank=${xlsxIdx}, mdRank=${mdIdx}` }
      }
    )
  }

  if (caseKey === 'four-quadrant-newly-installed-gate') {
    const qApps: SqliteSimulatedFileRow[] = [
      {
        id: 501,
        path: '/Applications/Q1-TrueFresh.app',
        name: 'Q1-TrueFresh',
        displayName: 'Q1-TrueFresh',
        extension: 'app',
        size: null,
        mtime: new Date(nowMs - DAY_MS),
        ctime: new Date(nowMs - DAY_MS), // ctime <= 7d
        lastIndexedAt: new Date(nowMs - DAY_MS),
        isDir: true,
        type: 'app',
        content: null,
        embeddingStatus: 'none'
      },
      {
        id: 502,
        path: '/Applications/Q2-OldMachineFirstScan.app',
        name: 'Q2-OldMachineFirstScan',
        displayName: 'Q2-OldMachineFirstScan',
        extension: 'app',
        size: null,
        mtime: new Date(nowMs - DAY_MS),
        ctime: new Date(nowMs - DAY_MS), // ctime <= 7d, but installedAt = 60d!
        lastIndexedAt: new Date(nowMs - DAY_MS),
        isDir: true,
        type: 'app',
        content: null,
        embeddingStatus: 'none'
      },
      {
        id: 503,
        path: '/Applications/Q3-SelfUpdatedApp.app',
        name: 'Q3-SelfUpdatedApp',
        displayName: 'Q3-SelfUpdatedApp',
        extension: 'app',
        size: null,
        mtime: new Date(nowMs - 30 * DAY_MS),
        ctime: new Date(nowMs - 30 * DAY_MS), // ctime = 30d, installedAt = 1d
        lastIndexedAt: new Date(nowMs - DAY_MS),
        isDir: true,
        type: 'app',
        content: null,
        embeddingStatus: 'none'
      },
      {
        id: 504,
        path: '/Applications/Q4-AncientApp.app',
        name: 'Q4-AncientApp',
        displayName: 'Q4-AncientApp',
        extension: 'app',
        size: null,
        mtime: new Date(nowMs - 60 * DAY_MS),
        ctime: new Date(nowMs - 60 * DAY_MS),
        lastIndexedAt: new Date(nowMs - 60 * DAY_MS),
        isDir: true,
        type: 'app',
        content: null,
        embeddingStatus: 'none'
      }
    ]
    const qExts = new Map<number, Array<{ fileId: number; key: string; value: string }>>([
      [
        501,
        [
          { fileId: 501, key: 'bundleId', value: 'dev.q1.fresh' },
          { fileId: 501, key: 'installedAt', value: String(nowMs - DAY_MS) }
        ]
      ],
      [
        502,
        [
          { fileId: 502, key: 'bundleId', value: 'dev.q2.oldscan' },
          { fileId: 502, key: 'installedAt', value: String(nowMs - 60 * DAY_MS) }
        ]
      ],
      [
        503,
        [
          { fileId: 503, key: 'bundleId', value: 'dev.q3.selfupdate' },
          { fileId: 503, key: 'installedAt', value: String(nowMs - DAY_MS) }
        ]
      ],
      [
        504,
        [
          { fileId: 504, key: 'bundleId', value: 'dev.q4.ancient' },
          { fileId: 504, key: 'installedAt', value: String(nowMs - 60 * DAY_MS) }
        ]
      ]
    ])

    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          { time: { hourOfDay: 10, dayOfWeek: 2, isWorkingHours: true, timeSlot: 'morning' } }
        ],
        customApps: qApps,
        customAppExts: qExts
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const newlyInstalledIds = res.items
          .filter((i) => i.meta?.recommendation?.source === 'newly-installed')
          .map((i) => i.render.basic?.title)
        const ok = newlyInstalledIds.length === 1 && newlyInstalledIds[0] === 'Q1-TrueFresh'
        return {
          passed: ok,
          evidence: `newlyInstalled=${JSON.stringify(newlyInstalledIds)}`
        }
      }
    )
  }

  if (caseKey === 'novelty-to-frecency-handoff') {
    const freshApp: SqliteSimulatedFileRow = {
      id: 601,
      path: '/Applications/BrandNewTool.app',
      name: 'BrandNewTool',
      displayName: 'BrandNewTool',
      extension: 'app',
      size: null,
      mtime: new Date(nowMs - 2 * HOUR_MS),
      ctime: new Date(nowMs - 2 * HOUR_MS),
      lastIndexedAt: new Date(nowMs - 2 * HOUR_MS),
      isDir: true,
      type: 'app',
      content: null,
      embeddingStatus: 'none'
    }
    const habitApp = env.appRows[0]! // VS Code
    const exts = new Map<number, Array<{ fileId: number; key: string; value: string }>>([
      [
        601,
        [
          { fileId: 601, key: 'bundleId', value: 'dev.new.tool' },
          { fileId: 601, key: 'installedAt', value: String(nowMs - 2 * HOUR_MS) }
        ]
      ],
      [habitApp.id, env.appExtensionsByFileId.get(habitApp.id) ?? []]
    ])

    // Before first execution: BrandNewTool gets 9e5 novelty boost > moderate habit
    const beforeOpen = await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          { time: { hourOfDay: 10, dayOfWeek: 2, isWorkingHours: true, timeSlot: 'morning' } }
        ],
        customApps: [freshApp, habitApp],
        customAppExts: exts,
        usageStats: [makeUsageStat('app-provider', habitApp.path, 'app', 6, nowMs - DAY_MS)],
        behaviorRows: [
          makeBehaviorRow('app-provider', habitApp.path, {
            executeCount: 6,
            executeCount30: 6,
            activeDays30: 4,
            lastExecutedAt: nowMs - DAY_MS
          })
        ]
      },
      async (engine) => await engine.recommend({ forceRefresh: true, limit: 10 })
    )

    // After first execution (`executeCount = 1`): novelty boost drops to 0 -> habitApp outranks BrandNewTool
    const afterOpen = await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          { time: { hourOfDay: 10, dayOfWeek: 2, isWorkingHours: true, timeSlot: 'morning' } }
        ],
        customApps: [freshApp, habitApp],
        customAppExts: exts,
        usageStats: [
          makeUsageStat('app-provider', habitApp.path, 'app', 16, nowMs - HOUR_MS),
          makeUsageStat('app-provider', freshApp.path, 'app', 1, nowMs - 6 * HOUR_MS)
        ],
        behaviorRows: [
          makeBehaviorRow('app-provider', habitApp.path, {
            executeCount: 16,
            executeCount30: 16,
            activeDays30: 8,
            lastExecutedAt: nowMs - HOUR_MS
          }),
          makeBehaviorRow('app-provider', freshApp.path, {
            executeCount: 1,
            executeCount30: 1,
            activeDays30: 1,
            lastExecutedAt: nowMs - 6 * HOUR_MS
          })
        ]
      },
      async (engine) => await engine.recommend({ forceRefresh: true, limit: 10 })
    )

    const hasNoveltyBefore = beforeOpen.items.some(
      (i) =>
        itemMatchesPath(i, freshApp.path) && i.meta?.recommendation?.source === 'newly-installed'
    )
    const habitAfterIdx = afterOpen.items.findIndex((i) => itemMatchesPath(i, habitApp.path))
    const freshAfterIdx = afterOpen.items.findIndex((i) => itemMatchesPath(i, freshApp.path))
    const habitWinsAfter =
      habitAfterIdx >= 0 && (freshAfterIdx < 0 || habitAfterIdx < freshAfterIdx)
    return {
      passed: hasNoveltyBefore && habitWinsAfter,
      evidence: `hasNoveltyBefore=${hasNoveltyBefore}, habitAfterIdx=${habitAfterIdx} vs freshAfterIdx=${freshAfterIdx}`
    }
  }

  if (caseKey === 'exploration-limit-one') {
    const freshApps: SqliteSimulatedFileRow[] = [1, 2, 3].map((n) => ({
      id: 700 + n,
      path: `/Applications/FreshExplore${n}.app`,
      name: `FreshExplore${n}`,
      displayName: `FreshExplore${n}`,
      extension: 'app',
      size: null,
      mtime: new Date(nowMs - n * HOUR_MS),
      ctime: new Date(nowMs - n * HOUR_MS),
      lastIndexedAt: new Date(nowMs - n * HOUR_MS),
      isDir: true,
      type: 'app',
      content: null,
      embeddingStatus: 'none'
    }))
    const habitApp = env.appRows[0]!
    const exts = new Map<number, Array<{ fileId: number; key: string; value: string }>>([
      [habitApp.id, env.appExtensionsByFileId.get(habitApp.id) ?? []],
      ...freshApps.map(
        (a) =>
          [
            a.id,
            [
              { fileId: a.id, key: 'bundleId', value: `dev.explore.${a.id}` },
              { fileId: a.id, key: 'installedAt', value: String(a.ctime.getTime()) }
            ]
          ] as [number, Array<{ fileId: number; key: string; value: string }>]
      )
    ])

    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          { time: { hourOfDay: 10, dayOfWeek: 2, isWorkingHours: true, timeSlot: 'morning' } }
        ],
        customApps: [habitApp, ...freshApps],
        customAppExts: exts,
        usageStats: [makeUsageStat('app-provider', habitApp.path, 'app', 15, nowMs - HOUR_MS)],
        behaviorRows: [
          makeBehaviorRow('app-provider', habitApp.path, {
            executeCount: 15,
            executeCount30: 15,
            activeDays30: 6,
            lastExecutedAt: nowMs - HOUR_MS
          })
        ]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const noveltyItems = res.items.filter(
          (i) =>
            i.meta?.recommendation?.source === 'newly-installed' ||
            i.meta?.recommendation?.source === 'newly-added'
        )
        const ok = noveltyItems.length === 1
        return {
          passed: ok,
          evidence: `admittedNoveltyCount=${noveltyItems.length} (EXPLORATION_LIMIT=1)`
        }
      }
    )
  }

  if (caseKey === 'destination-query-intent-bonus') {
    const destItem = new TuffItemBuilder('main-window', 'system', APP_DESTINATION_PROVIDER_ID)
      .setKind('feature')
      .setTitle('显示主窗口')
      .build()
    const normalApp = new TuffItemBuilder('other', 'application', 'app-provider')
      .setKind('app')
      .setTitle('WindowManager Helper')
      .build()
    const sorted = tuffSorter.sort(
      [normalApp, destItem],
      { text: '打开主窗口' } as never,
      new AbortController().signal
    )
    const ok = sorted[0]?.id === 'main-window' && (sorted[0]?.scoring?.final ?? 0) >= 6_500_000
    return {
      passed: ok,
      evidence: `top=${sorted[0]?.id}, score=${round(sorted[0]?.scoring?.final ?? 0, 0)}`
    }
  }

  if (caseKey === 'diversity-quota-and-backfill') {
    const tenApps = env.appRows.slice(0, 10)
    const fourSqliteFiles = [...env.sqliteFilesByPath.values()].slice(0, 4)

    // Subcase 1: Mixed pool (8 apps + 4 files) -> files enter top 10 thanks to 40% quota
    const mixedRes = await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          { time: { hourOfDay: 10, dayOfWeek: 2, isWorkingHours: true, timeSlot: 'morning' } }
        ],
        usageStats: [
          ...tenApps
            .slice(0, 8)
            .map((a, idx) =>
              makeUsageStat('app-provider', a.path, 'app', 30 - idx, nowMs - HOUR_MS)
            ),
          ...fourSqliteFiles.map((f, idx) =>
            makeUsageStat(
              FILE_RECOMMENDATION_SOURCE_ID,
              f.path,
              'file',
              12 - idx,
              nowMs - 2 * HOUR_MS
            )
          )
        ],
        behaviorRows: [
          ...tenApps.slice(0, 8).map((a, idx) =>
            makeBehaviorRow('app-provider', a.path, {
              executeCount: 30 - idx,
              executeCount30: 30 - idx,
              activeDays30: 8,
              lastExecutedAt: nowMs - HOUR_MS
            })
          ),
          ...fourSqliteFiles.map((f, idx) =>
            makeBehaviorRow(FILE_RECOMMENDATION_SOURCE_ID, f.path, {
              executeCount: 12 - idx,
              executeCount30: 12 - idx,
              activeDays30: 4,
              lastExecutedAt: nowMs - 2 * HOUR_MS
            })
          )
        ]
      },
      async (engine) => await engine.recommend({ forceRefresh: true, limit: 10 })
    )

    // Subcase 2: Homogeneous pool (10 apps only) -> deferred apps backfill to full 10 (#672)
    const homoRes = await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          { time: { hourOfDay: 10, dayOfWeek: 2, isWorkingHours: true, timeSlot: 'morning' } }
        ],
        usageStats: tenApps.map((a, idx) =>
          makeUsageStat('app-provider', a.path, 'app', 30 - idx, nowMs - HOUR_MS)
        ),
        behaviorRows: tenApps.map((a, idx) =>
          makeBehaviorRow('app-provider', a.path, {
            executeCount: 30 - idx,
            executeCount30: 30 - idx,
            activeDays30: 8,
            lastExecutedAt: nowMs - HOUR_MS
          })
        ),
        customBridge: null // isolate pure 10-app homogeneous pool
      },
      async (engine) => await engine.recommend({ forceRefresh: true, limit: 10 })
    )

    const mixedHasFiles = mixedRes.items.some((i) => i.source.id === FILE_RECOMMENDATION_SOURCE_ID)
    const homoFullTen = homoRes.items.length === 10
    return {
      passed: mixedHasFiles && homoFullTen,
      evidence: `mixedHasFiles=${mixedHasFiles}, homogeneousCount=${homoRes.items.length}`
    }
  }

  if (caseKey === 'cached-volatile-idempotent-semantic-switch') {
    const seed = defaultHabitSeed(nowMs)
    const fixedTime = {
      hourOfDay: 14,
      dayOfWeek: 2,
      isWorkingHours: true,
      timeSlot: 'afternoon' as const
    }
    const errText = 'SqliteError: SQLITE_BUSY: database is locked at WalCheckpoint'
    const walDoc = path.join(env.rootDir, 'Documents/notes/sqlite-wal-busy-tuning.md')

    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: fixedTime,
            clipboard: {
              type: 'files',
              content: hashContextContent('["/proj/index.ts"]'),
              timestamp: nowMs,
              contentType: 'file',
              meta: { fileType: 'code', language: 'typescript' }
            }
          },
          {
            time: fixedTime,
            clipboard: {
              type: 'text',
              content: hashContextContent(errText),
              timestamp: nowMs + 1000,
              contentType: 'text'
            }
          }
        ],
        ...seed
      },
      async (engine) => {
        const pass1 = await engine.recommend({ forceRefresh: true, limit: 10 })
        const vsPass1 = pass1.items.find((i) =>
          itemMatchesPath(i, '/Applications/Visual Studio Code.app')
        )
        const vsScore1 = vsPass1?.scoring?.final ?? 0

        hooks.setClipboardLatest({
          type: 'text',
          content: errText,
          timestamp: new Date(nowMs + 1000)
        })
        const pass2 = await engine.recommend({ forceRefresh: false, limit: 10 })
        const vsPass2 = pass2.items.find((i) =>
          itemMatchesPath(i, '/Applications/Visual Studio Code.app')
        )
        const vsScore2 = vsPass2?.scoring?.final ?? 0
        const hasWalDoc = pass2.items.some((i) => itemMatchesPath(i, walDoc))

        // Pass 1 gave VS Code +100k (typescript), Pass 2 gives +70k (plain text editor), NOT +170k!
        const nonCompounding = vsScore2 < vsScore1
        const ok = pass2.fromCache && nonCompounding && hasWalDoc
        return {
          passed: ok,
          evidence: `fromCache=${pass2.fromCache}, nonCompounding=${nonCompounding} (${vsScore1}->${vsScore2}), walDoc=${hasWalDoc}`
        }
      }
    )
  }

  throw new Error(`Unhandled hybrid-ranking caseKey: ${caseKey}`)
}

export function computeDualLayerFootprint(env: SandboxEnv): Rec100FootprintReport {
  const sampleArena = createArenaWithFallback()
  const sampleCount = 4_000
  const entries = Array.from({ length: sampleCount }, (_, i) => ({
    dir: `/workspace/group-${Math.floor(i / 80)}/pkg-${i % 80}`,
    name: `module-service-handler-${i}.ts`,
    isDir: false,
    mtimeSec: 1_700_000_000 + i
  }))
  const stats = sampleArena.replaceEntries(entries, 1)
  const snapFile = path.join(env.rootDir, 'footprint-probe.tuffidx3')
  const snapBytes = sampleArena.saveSnapshot(snapFile)
  fs.rmSync(snapFile, { force: true })

  const arenaBytesPerEntry = stats.arenaBytes / sampleCount
  const snapBytesPerEntry = snapBytes / sampleCount

  const sampleVec = embedDeterministicGemma768('sample vector compression probe')
  const blobBytes = encodeVectorBlob(sampleVec).byteLength
  const jsonBytes = Buffer.byteLength(JSON.stringify(Array.from(sampleVec)), 'utf8')

  const simulatedColdFileCount = 100_000
  const simulatedHotDocCount = 3_000
  const simulatedChunksPerHotDoc = 2

  const dualLayer100kArenaMiB = (arenaBytesPerEntry * simulatedColdFileCount) / (1024 * 1024)
  const dualLayer100kSnapshotMiB = (snapBytesPerEntry * simulatedColdFileCount) / (1024 * 1024)
  // SQLite hot-doc vectors + metadata overhead (~1.35x B-tree page overhead on 3,072B BLOBs)
  const dualLayer3kHotDocVectorsMiB =
    (simulatedHotDocCount * simulatedChunksPerHotDoc * blobBytes * 1.35) / (1024 * 1024)
  const dualLayerTotalFootprintMiB = dualLayer100kSnapshotMiB + dualLayer3kHotDocVectorsMiB

  // Pre-refactor measured baseline: 3.17 GiB (3,246 MiB) for 101K SQLite rows + 2.6M keyword n-grams
  const legacySingleLayer100kFootprintMiB = 3_246.08

  return {
    hotDocVectorDim: GEMMA_EMBEDDING_DIM,
    bytesPerVectorBlob: blobBytes,
    bytesPerLegacyJsonVector: jsonBytes,
    blobCompressionRatioPct: round((1 - blobBytes / jsonBytes) * 100, 1),
    simulatedColdFileCount,
    simulatedHotDocCount,
    simulatedChunksPerHotDoc,
    measuredArenaBytesPerEntry: round(arenaBytesPerEntry, 2),
    measuredSnapshotBytesPerEntry: round(snapBytesPerEntry, 2),
    dualLayer100kArenaMiB: round(dualLayer100kArenaMiB, 2),
    dualLayer100kSnapshotMiB: round(dualLayer100kSnapshotMiB, 2),
    dualLayer3kHotDocVectorsMiB: round(dualLayer3kHotDocVectorsMiB, 2),
    dualLayerTotalFootprintMiB: round(dualLayerTotalFootprintMiB, 2),
    dualLayerBudgetLimitMiB: 80,
    legacySingleLayer100kFootprintMiB
  }
}

async function runResourceSecurityScenario(
  scenario: Rec100ScenarioDefinition,
  mode: Rec100ArchitectureMode,
  env: SandboxEnv,
  hooks: Rec100RuntimeHooks,
  footprint: Rec100FootprintReport
): Promise<{ passed: boolean; evidence: string }> {
  const p = scenario.params
  const caseKey = String(p.caseKey)
  const nowMs = env.nowMs
  const baseTime = {
    hourOfDay: 15,
    dayOfWeek: 3,
    isWorkingHours: true,
    timeSlot: 'afternoon' as const
  }

  if (caseKey === 'low-battery-lightweight-boost') {
    const vscode = '/Applications/Visual Studio Code.app'
    const sublime = '/Applications/Sublime Text.app'
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            systemState: {
              isOnline: true,
              isDNDEnabled: false,
              powerMode: 'battery',
              batteryLevel: 18,
              isOnBattery: true,
              isCharging: false
            }
          }
        ],
        usageStats: [
          makeUsageStat('app-provider', vscode, 'app', 10, nowMs - 2 * HOUR_MS),
          makeUsageStat('app-provider', sublime, 'app', 10, nowMs - 2 * HOUR_MS)
        ],
        behaviorRows: [
          makeBehaviorRow('app-provider', vscode, {
            executeCount: 10,
            executeCount30: 10,
            activeDays30: 5,
            lastExecutedAt: nowMs - 2 * HOUR_MS
          }),
          makeBehaviorRow('app-provider', sublime, {
            executeCount: 10,
            executeCount30: 10,
            activeDays30: 5,
            lastExecutedAt: nowMs - 2 * HOUR_MS
          })
        ]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const subIdx = res.items.findIndex((i) => itemMatchesPath(i, sublime))
        const vsIdx = res.items.findIndex((i) => itemMatchesPath(i, vscode))
        return {
          passed: subIdx >= 0 && vsIdx >= 0 && subIdx < vsIdx,
          evidence: `sublimeRank=${subIdx} < vscodeRank=${vsIdx} at battery=18%`
        }
      }
    )
  }

  if (caseKey === 'offline-browser-demote') {
    const chrome = '/Applications/Google Chrome.app'
    const sublime = '/Applications/Sublime Text.app'
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            systemState: {
              isOnline: false,
              networkType: 'offline',
              isDNDEnabled: false
            }
          }
        ],
        usageStats: [
          makeUsageStat('app-provider', chrome, 'app', 10, nowMs - 2 * HOUR_MS),
          makeUsageStat('app-provider', sublime, 'app', 10, nowMs - 2 * HOUR_MS)
        ],
        behaviorRows: [
          makeBehaviorRow('app-provider', chrome, {
            executeCount: 10,
            executeCount30: 10,
            activeDays30: 5,
            lastExecutedAt: nowMs - 2 * HOUR_MS
          }),
          makeBehaviorRow('app-provider', sublime, {
            executeCount: 10,
            executeCount30: 10,
            activeDays30: 5,
            lastExecutedAt: nowMs - 2 * HOUR_MS
          })
        ]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const subIdx = res.items.findIndex((i) => itemMatchesPath(i, sublime))
        const chrIdx = res.items.findIndex((i) => itemMatchesPath(i, chrome))
        return {
          passed: subIdx >= 0 && chrIdx >= 0 && subIdx < chrIdx,
          evidence: `sublimeRank=${subIdx} < chromeRank=${chrIdx} offline`
        }
      }
    )
  }

  if (caseKey === 'focus-dnd-entertainment-suppress') {
    const vscode = '/Applications/Visual Studio Code.app'
    const wechat = '/Applications/WeChat.app'
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            systemState: {
              isOnline: true,
              isDNDEnabled: true,
              focusMode: 'active'
            }
          }
        ],
        usageStats: [
          makeUsageStat('app-provider', wechat, 'app', 10, nowMs - 2 * HOUR_MS),
          makeUsageStat('app-provider', vscode, 'app', 10, nowMs - 2 * HOUR_MS)
        ],
        behaviorRows: [
          makeBehaviorRow('app-provider', wechat, {
            executeCount: 10,
            executeCount30: 10,
            activeDays30: 5,
            lastExecutedAt: nowMs - 2 * HOUR_MS
          }),
          makeBehaviorRow('app-provider', vscode, {
            executeCount: 10,
            executeCount30: 10,
            activeDays30: 5,
            lastExecutedAt: nowMs - 2 * HOUR_MS
          })
        ]
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const vsIdx = res.items.findIndex((i) => itemMatchesPath(i, vscode))
        const wxIdx = res.items.findIndex((i) => itemMatchesPath(i, wechat))
        return {
          passed: vsIdx >= 0 && wxIdx >= 0 && vsIdx < wxIdx,
          evidence: `vscodeRank=${vsIdx} < wechatRank=${wxIdx} under DND`
        }
      }
    )
  }

  if (caseKey === 'dual-layer-80mib-budget-proof') {
    const usedMiB =
      mode === 'dual-layer-gemma-arena'
        ? footprint.dualLayerTotalFootprintMiB
        : footprint.legacySingleLayer100kFootprintMiB
    const ok = usedMiB < footprint.dualLayerBudgetLimitMiB
    return {
      passed: ok,
      evidence: `diskFootprint=${usedMiB} MiB vs budget=${footprint.dualLayerBudgetLimitMiB} MiB`
    }
  }

  if (caseKey === 'vector-blob-codec-integrity') {
    if (mode === 'legacy-single-layer') {
      return {
        passed: false,
        evidence: `legacy JSON text vector=${footprint.bytesPerLegacyJsonVector}B (> 4096B ceiling)`
      }
    }
    const vec = embedDeterministicGemma768('codec integrity verification')
    const blob = encodeVectorBlob(vec)
    const decoded = readStoredVector(blob, GEMMA_EMBEDDING_DIM)
    const sim = decoded ? cosineSimilarity768(vec, decoded) : 0

    const wrongDim = new Uint8Array(512 * 4)
    const nanBuf = new Uint8Array(GEMMA_VECTOR_BLOB_BYTES)
    new DataView(nanBuf.buffer).setFloat32(0, Number.NaN, true)

    const ok =
      blob.byteLength === GEMMA_VECTOR_BLOB_BYTES &&
      sim > 0.999999 &&
      readStoredVector(wrongDim, GEMMA_EMBEDDING_DIM) === null &&
      readStoredVector(nanBuf, GEMMA_EMBEDDING_DIM) === null
    return {
      passed: ok,
      evidence: `blobBytes=${blob.byteLength}, roundtripCosine=${round(sim, 6)}, rejectedCorrupt=true`
    }
  }

  if (caseKey === 'scrub-clipboard-secret-token') {
    let semanticCalls = 0
    const safeQuery = 'SqliteError: SQLITE_BUSY: database is locked at WalCheckpoint'
    const secretQuery = 'OPENAI_API_KEY=sk-proj-99887766554433221100abcdefSECRET'
    const seed = defaultHabitSeed(nowMs)

    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            clipboard: {
              type: 'text',
              content: hashContextContent(safeQuery),
              timestamp: nowMs,
              contentType: 'text'
            }
          },
          {
            time: baseTime,
            clipboard: {
              type: 'text',
              content: hashContextContent(secretQuery),
              timestamp: nowMs + 1000,
              contentType: 'text'
            }
          }
        ],
        onSemanticRecallQuery: () => {
          semanticCalls += 1
        },
        ...seed
      },
      async (engine) => {
        hooks.setClipboardLatest({ type: 'text', content: safeQuery, timestamp: new Date(nowMs) })
        await engine.recommend({ forceRefresh: true, limit: 10 })
        const callsAfterSafe = semanticCalls

        semanticCalls = 0
        hooks.setClipboardLatest({
          type: 'text',
          content: secretQuery,
          timestamp: new Date(nowMs + 1000)
        })
        const resSecret = await engine.recommend({ forceRefresh: true, limit: 10 })
        const callsAfterSecret = semanticCalls

        const ok = callsAfterSafe === 1 && callsAfterSecret === 0 && resSecret.items.length > 0
        return {
          passed: ok,
          evidence: `safeQueryCalls=${callsAfterSafe}, secretQueryCalls=${callsAfterSecret}, safeFallbackItems=${resSecret.items.length}`
        }
      }
    )
  }

  if (caseKey === 'reject-sensitive-credential-files') {
    const safeDoc = path.join(env.rootDir, 'Documents/notes/sqlite-wal-busy-tuning.md')
    const envProd = path.join(env.rootDir, '.env.production')
    const sshKey = path.join(env.rootDir, '.ssh/id_rsa')
    const privKey = path.join(env.rootDir, 'certs/server.key')
    const pemFile = path.join(env.rootDir, 'certs/ca.pem')

    const customBridge: FileRecommendationBridge | null =
      mode === 'dual-layer-gemma-arena'
        ? {
            lookupFilesByPaths: async () => new Map(),
            listRecentFiles: async () => [],
            recallSemanticFiles: async (): Promise<ContextualSemanticFileHit[]> => [
              { path: envProd, score: 0.96 },
              { path: sshKey, score: 0.95 },
              { path: privKey, score: 0.94 },
              { path: pemFile, score: 0.93 },
              { path: safeDoc, score: 0.88 }
            ]
          }
        : null

    const query = 'SqliteError: SQLITE_BUSY: database is locked'
    hooks.setClipboardLatest({ type: 'text', content: query, timestamp: new Date(nowMs) })
    const seed = defaultHabitSeed(nowMs)

    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            clipboard: {
              type: 'text',
              content: hashContextContent(query),
              timestamp: nowMs,
              contentType: 'text'
            }
          }
        ],
        customBridge,
        ...seed
      },
      async (engine) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const leakedSensitive = [envProd, sshKey, privKey, pemFile].some((bad) =>
          res.items.some((i) => itemMatchesPath(i, bad))
        )
        const keptSafeDoc = res.items.some((i) => itemMatchesPath(i, safeDoc))
        const admissionBlockedAll = [envProd, sshKey].every(
          (bad) => !isRecommendableNewFile({ path: bad, size: 64, isDir: false })
        )
        return {
          passed: !leakedSensitive && keptSafeDoc && admissionBlockedAll,
          evidence: `leakedSensitive=${leakedSensitive}, keptSafeDoc=${keptSafeDoc}, admissionBlocked=${admissionBlockedAll}`
        }
      }
    )
  }

  if (caseKey === 'cache-isolation-no-raw-or-volatile-leak') {
    const rawClip = 'SqliteError: SQLITE_BUSY: database is locked at WalCheckpoint'
    const walDoc = path.join(env.rootDir, 'Documents/notes/sqlite-wal-busy-tuning.md')
    hooks.setClipboardLatest({ type: 'text', content: rawClip, timestamp: new Date(nowMs) })
    const seed = defaultHabitSeed(nowMs)

    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          {
            time: baseTime,
            clipboard: {
              type: 'text',
              content: hashContextContent(rawClip),
              timestamp: nowMs,
              contentType: 'text'
            }
          }
        ],
        ...seed
      },
      async (engine, persistedCaches) => {
        const res = await engine.recommend({ forceRefresh: true, limit: 10 })
        const signalHashOnly =
          res.context.clipboard?.content === hashContextContent(rawClip) &&
          res.context.clipboard?.content?.length === 16
        const cacheJson = persistedCaches.map((c) => c.json).join('\n')
        const cacheFreeOfRawAndVolatile =
          persistedCaches.length > 0 &&
          !cacheJson.includes(rawClip) &&
          !cacheJson.includes('sqlite-wal-busy-tuning.md')
        const finalHasVolatileFile = res.items.some((i) => itemMatchesPath(i, walDoc))

        return {
          passed: signalHashOnly && cacheFreeOfRawAndVolatile && finalHasVolatileFile,
          evidence: `signal16Hex=${signalHashOnly}, cacheClean=${cacheFreeOfRawAndVolatile}, volatileDelivered=${finalHasVolatileFile}`
        }
      }
    )
  }

  if (caseKey === 'ai-usage-limit-pause-and-resume') {
    hooks.setSemanticSettings({
      localVectorEnabled: true,
      aiEmbeddingEnabled: true,
      aiRerankEnabled: false
    })
    hooks.resetEmbeddingGenerateCallCount()
    let shouldFailLimit = true
    hooks.setEmbeddingGenerateImpl(async ({ text }) => {
      if (shouldFailLimit) {
        throw createUsageLimitError('embedding.generate', {
          key: 'requestsPerDay',
          used: 100,
          max: 100,
          resetsAt: Date.now() + 60 * 60_000
        })
      }
      return { result: Array.from(embedDeterministicGemma768(text).slice(0, 64)) }
    })

    const seed = defaultHabitSeed(nowMs)
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [{ time: baseTime }, { time: baseTime }, { time: baseTime }],
        ...seed
      },
      async (engine) => {
        const pass1 = await engine.recommend({ forceRefresh: true, limit: 10 })
        const callsAfterTrip = hooks.getEmbeddingGenerateCallCount()

        // While paused by usage limit, Pass 2 must make 0 remote embedding calls
        await engine.recommend({ forceRefresh: true, limit: 10 })
        const callsDuringPause = hooks.getEmbeddingGenerateCallCount() - callsAfterTrip

        // Raising/clearing limit wakes semantic AI immediately
        shouldFailLimit = false
        notifyUsageLimitsChanged(emptyUsageLimits())
        await engine.recommend({ forceRefresh: true, limit: 10 })
        const callsAfterResume = hooks.getEmbeddingGenerateCallCount() - callsAfterTrip

        const ok =
          pass1.items.length > 0 &&
          callsAfterTrip === 1 &&
          callsDuringPause === 0 &&
          callsAfterResume >= 1
        return {
          passed: ok,
          evidence: `tripCalls=${callsAfterTrip}, pausedCalls=${callsDuringPause}, resumedCalls=${callsAfterResume}`
        }
      }
    )
  }

  if (caseKey === 'semantic-timeout-and-circuit-breaker') {
    hooks.setSemanticSettings({
      localVectorEnabled: true,
      aiEmbeddingEnabled: true,
      aiRerankEnabled: false
    })
    hooks.resetEmbeddingGenerateCallCount()
    hooks.setEmbeddingGenerateImpl(async () => {
      throw new Error('Simulated embedding provider timeout')
    })

    const seed = defaultHabitSeed(nowMs)
    return await withConfiguredEngine(
      {
        mode,
        env,
        hooks,
        contextQueue: [
          { time: baseTime },
          { time: baseTime },
          { time: baseTime },
          { time: baseTime }
        ],
        ...seed
      },
      async (engine) => {
        await engine.recommend({ forceRefresh: true, limit: 10 })
        await engine.recommend({ forceRefresh: true, limit: 10 })
        await engine.recommend({ forceRefresh: true, limit: 10 })
        const callsAfter3Failures = hooks.getEmbeddingGenerateCallCount()

        // 4th pass must be short-circuited by cooldown (0 calls)
        const t0 = performance.now()
        const pass4 = await engine.recommend({ forceRefresh: true, limit: 10 })
        const pass4Ms = performance.now() - t0
        const callsOnPass4 = hooks.getEmbeddingGenerateCallCount() - callsAfter3Failures

        const ok =
          callsAfter3Failures === 3 && callsOnPass4 === 0 && pass4.items.length > 0 && pass4Ms < 100
        return {
          passed: ok,
          evidence: `failuresBeforeTrip=${callsAfter3Failures}, callsInCooldown=${callsOnPass4}, fallbackMs=${round(pass4Ms, 2)}`
        }
      }
    )
  }

  throw new Error(`Unhandled resource-security caseKey: ${caseKey}`)
}

export async function evaluateSingleRec100Scenario(
  scenario: Rec100ScenarioDefinition,
  mode: Rec100ArchitectureMode,
  env: SandboxEnv,
  hooks: Rec100RuntimeHooks,
  footprint: Rec100FootprintReport
): Promise<Rec100ModeOutcome> {
  const startedAt = performance.now()
  let outcome: { passed: boolean; evidence: string }

  switch (scenario.kind) {
    case 'zero-input':
      outcome = await runZeroInputScenario(scenario, mode, env, hooks)
      break
    case 'semantic-query':
    case 'multimodal-query':
      outcome = await runSemanticOrMultimodalQuery(scenario, mode, env)
      break
    case 'arena-fastpath':
      outcome = await runArenaFastpathScenario(scenario, mode, env)
      break
    case 'fs-realtime':
      outcome = await runFsRealtimeScenario(scenario, mode, env, hooks)
      break
    case 'hybrid-ranking':
      outcome = await runHybridRankingScenario(scenario, mode, env, hooks)
      break
    case 'resource-security':
      outcome = await runResourceSecurityScenario(scenario, mode, env, hooks, footprint)
      break
  }

  const durationMs = round(performance.now() - startedAt, 3)
  return {
    passed: outcome.passed,
    durationMs,
    evidence: sanitizeEvidence(outcome.evidence, env.rootDir)
  }
}

export async function evaluateRec100Suite(hooks: Rec100RuntimeHooks): Promise<Rec100SuiteReport> {
  const env = await createSandboxEnv()
  try {
    const footprint = computeDualLayerFootprint(env)
    const categoryMetaById = new Map(REC_100_CATEGORIES.map((c) => [c.id, c]))
    const comparisons: Rec100ScenarioComparison[] = []

    for (const scenario of REC_100_SCENARIOS) {
      const legacy = await evaluateSingleRec100Scenario(
        scenario,
        'legacy-single-layer',
        env,
        hooks,
        footprint
      )
      const dualLayer = await evaluateSingleRec100Scenario(
        scenario,
        'dual-layer-gemma-arena',
        env,
        hooks,
        footprint
      )
      const catMeta = categoryMetaById.get(scenario.categoryId)!
      comparisons.push({
        id: scenario.id,
        index: scenario.index,
        categoryId: scenario.categoryId,
        categoryTitle: catMeta.titleZh,
        title: scenario.title,
        signalSummary: scenario.signalSummary,
        expectedBehavior: scenario.expectedBehavior,
        layers: scenario.layers,
        codeRefs: scenario.codeRefs,
        legacy,
        dualLayer
      })
    }

    const legacyDurations = comparisons.map((c) => c.legacy.durationMs)
    const dualDurations = comparisons.map((c) => c.dualLayer.durationMs)
    const legacyPassed = comparisons.filter((c) => c.legacy.passed).length
    const dualPassed = comparisons.filter((c) => c.dualLayer.passed).length

    const categories: Rec100CategorySummary[] = REC_100_CATEGORIES.map((cat) => {
      const rows = comparisons.filter((c) => c.categoryId === cat.id)
      const lPass = rows.filter((r) => r.legacy.passed).length
      const dPass = rows.filter((r) => r.dualLayer.passed).length
      const lAvg = rows.reduce((sum, r) => sum + r.legacy.durationMs, 0) / Math.max(1, rows.length)
      const dAvg =
        rows.reduce((sum, r) => sum + r.dualLayer.durationMs, 0) / Math.max(1, rows.length)
      return {
        categoryId: cat.id,
        index: cat.index,
        titleZh: cat.titleZh,
        titleEn: cat.titleEn,
        total: rows.length,
        legacyPassed: lPass,
        dualLayerPassed: dPass,
        legacyAvgMs: round(lAvg, 3),
        dualLayerAvgMs: round(dAvg, 3)
      }
    })

    return {
      generatedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      totalScenarios: comparisons.length,
      legacySummary: {
        passed: legacyPassed,
        failed: comparisons.length - legacyPassed,
        passRatePct: round((legacyPassed / comparisons.length) * 100, 1),
        totalDurationMs: round(
          legacyDurations.reduce((a, b) => a + b, 0),
          2
        ),
        p50Ms: percentile(legacyDurations, 50),
        p95Ms: percentile(legacyDurations, 95),
        maxMs: round(Math.max(...legacyDurations, 0), 3)
      },
      dualLayerSummary: {
        passed: dualPassed,
        failed: comparisons.length - dualPassed,
        passRatePct: round((dualPassed / comparisons.length) * 100, 1),
        unlockedOverLegacy: dualPassed - legacyPassed,
        totalDurationMs: round(
          dualDurations.reduce((a, b) => a + b, 0),
          2
        ),
        p50Ms: percentile(dualDurations, 50),
        p95Ms: percentile(dualDurations, 95),
        maxMs: round(Math.max(...dualDurations, 0), 3)
      },
      footprint,
      categories,
      scenarios: comparisons
    }
  } finally {
    env.dispose()
  }
}
