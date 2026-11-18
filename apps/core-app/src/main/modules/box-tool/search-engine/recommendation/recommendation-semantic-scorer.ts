import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { ContextSignal } from '@talex-touch/utils/core-box'
import type {
  ContextualSemanticFileHit,
  FileRecommendationBridge
} from '../../addon/files/file-recommendation-bridge'
import type { CandidateItem, ScoredItem } from './recommendation-catalog-candidates'
import type {
  RecommendationSemanticCandidateInput,
  RecommendationSemanticProfile
} from './semantic-profile'
import { StorageList } from '@talex-touch/utils'
import { getFileRecommendationBridge } from '../../addon/files/file-recommendation-bridge'
import { readUsageLimitInfo } from '../../../ai/usage-ledger/usage-limits'
import { hashContextContent } from './context-provider'
import { BUILTIN_CLIPBOARD_URL_SOURCE_ID } from './plugin-recommendation-source'
import { toErrorMeta, type LogMeta } from './recommendation-utils'
import { buildCandidateSemanticProfile } from './semantic-profile'
import { isSensitiveFilePath } from './volatile-context-matcher'

export const SEMANTIC_LOCAL_WEIGHT = 6e5
export const SEMANTIC_AI_EMBEDDING_WEIGHT = 4e5
export const SEMANTIC_AI_RERANK_WEIGHT = 3e5
export const SEMANTIC_AI_RERANK_ORDER_WEIGHT = 1e4
export const SEMANTIC_AI_TIMEOUT_MS = 800
export const AI_EMBEDDING_CANDIDATE_LIMIT = 8
export const AI_RERANK_CANDIDATE_LIMIT = 12
export const CANDIDATE_EMBEDDING_CACHE_LIMIT = 256

/**
 * Contextual Gemma file recall band: bounded below clipboard-URL (95 * 1e4 .. 95 * 1e5)
 * and mature daily habits (1e6), while surfacing strongly matching documents in the grid.
 */
export const CONTEXTUAL_SEMANTIC_FILE_WEIGHT = 8.5e5
export const CONTEXTUAL_SEMANTIC_RECALL_LIMIT = 4
export const CONTEXTUAL_SEMANTIC_RECALL_MIN_SCORE = 0.42
export const CONTEXTUAL_SEMANTIC_RECALL_TIMEOUT_MS = 120
const CONTEXTUAL_QUERY_MAX_LENGTH = 400
const MIN_WINDOW_TITLE_QUERY_LENGTH = 4
const MIN_CLIPBOARD_QUERY_LENGTH = 3

const SEMANTIC_AI_FAILURE_THRESHOLD = 3
const SEMANTIC_AI_COOLDOWN_MS = 5 * 60 * 1000

export interface RecommendationSemanticSettings {
  localVectorEnabled: boolean
  aiRerankEnabled: boolean
  aiEmbeddingEnabled: boolean
}

export const DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS: RecommendationSemanticSettings = {
  localVectorEnabled: true,
  aiRerankEnabled: false,
  aiEmbeddingEnabled: false
}

export interface SemanticScorerLogger {
  debug(message: string, options?: { meta?: LogMeta }): void
}

export interface ContextualRecallDeps {
  getBridge?: () => FileRecommendationBridge | null
  readLatestClipboardText?: () => Promise<string | null>
  readLatestSelectionText?: () => Promise<string | null>
  readSnapshotWindowTitle?: (expectedBundleId: string) => Promise<string | null>
  timeoutMs?: number
}

const GENERIC_WINDOW_TITLES: ReadonlySet<string> = new Set([
  'untitled',
  'new tab',
  'about:blank',
  '新建标签页',
  '无标题',
  'finder',
  '访达',
  'wechat',
  '微信',
  'visual studio code',
  'terminal',
  '终端'
])

const SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z0-9 _-]+PRIVATE KEY-----/i,
  /\bssh-(?:rsa|ed25519|dss|ecdsa)\s+[A-Za-z0-9+/=]{32,}/i,
  /\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{12,}\b/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[0-9A-Za-z-]{16,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\b(?:rk|pk)_(?:live|test)_[0-9A-Za-z]{16,}\b/,
  /\bglpat-[0-9A-Za-z_-]{16,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqp):\/\/[^:\s]+:[^@\s]+@/i,
  /(?:^|[\s;])(?:[A-Z0-9_]*?(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CLIENT_SECRET)[A-Z0-9_]*)\s*[:=]\s*\S+/im
]

const ENV_ASSIGNMENT_LINE_RE = /^\s*(?:export\s+)?[A-Z][A-Z0-9_]{2,}\s*=\s*\S+/gm

export function normalizeRecommendationSemanticSettings(
  value: unknown
): RecommendationSemanticSettings {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    localVectorEnabled:
      typeof raw.localVectorEnabled === 'boolean'
        ? raw.localVectorEnabled
        : DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS.localVectorEnabled,
    aiRerankEnabled:
      typeof raw.aiRerankEnabled === 'boolean'
        ? raw.aiRerankEnabled
        : DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS.aiRerankEnabled,
    aiEmbeddingEnabled:
      typeof raw.aiEmbeddingEnabled === 'boolean'
        ? raw.aiEmbeddingEnabled
        : DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS.aiEmbeddingEnabled
  }
}

export function isDefaultRecommendationSemanticSettings(
  settings: RecommendationSemanticSettings
): boolean {
  return (
    settings.localVectorEnabled === DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS.localVectorEnabled &&
    settings.aiRerankEnabled === DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS.aiRerankEnabled &&
    settings.aiEmbeddingEnabled === DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS.aiEmbeddingEnabled
  )
}

export async function loadRecommendationSemanticSettings(
  log: SemanticScorerLogger
): Promise<RecommendationSemanticSettings> {
  try {
    const { getMainConfig, isMainStorageReady } = await import('../../../storage')
    if (!isMainStorageReady()) {
      return DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS
    }

    const settings = getMainConfig(StorageList.APP_SETTING) as AppSetting | undefined
    return normalizeRecommendationSemanticSettings(settings?.recommendation?.semantic)
  } catch (error) {
    log.debug('Failed to load recommendation semantic settings', {
      meta: toErrorMeta(error)
    })
    return DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS
  }
}

export function calculateVectorCosine(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length)
  if (length === 0) return 0

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let i = 0; i < length; i += 1) {
    const lv = left[i]!
    const rv = right[i]!
    dot += lv * rv
    leftNorm += lv * lv
    rightNorm += rv * rv
  }

  if (leftNorm === 0 || rightNorm === 0) return 0
  const score = dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
  return Math.max(0, Math.min(1, score))
}

export function calculateContextualSemanticFileScore(similarityScore: number): number {
  const clamped = Number.isFinite(similarityScore) ? Math.max(0, Math.min(1, similarityScore)) : 0
  return (0.55 + clamped * 0.45) * CONTEXTUAL_SEMANTIC_FILE_WEIGHT
}

function shannonEntropy(value: string): number {
  if (value.length === 0) return 0
  const counts = new Map<string, number>()
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]!
    counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  let entropy = 0
  const invLen = 1 / value.length
  for (const count of counts.values()) {
    const p = count * invLen
    entropy -= p * Math.log2(p)
  }
  return entropy
}

function isLikelyOpaqueHighEntropySecret(trimmed: string): boolean {
  if (/\s/.test(trimmed) || trimmed.length < 16) return false
  if (trimmed.includes('/') || trimmed.includes('\\')) return false
  if (/\.[a-z0-9]{1,6}$/i.test(trimmed)) return false

  let classes = 0
  if (/[a-z]/.test(trimmed)) classes += 1
  if (/[A-Z]/.test(trimmed)) classes += 1
  if (/[0-9]/.test(trimmed)) classes += 1
  const hasSecretSymbol = /[^a-zA-Z0-9_./:-]/.test(trimmed)
  if (hasSecretSymbol) classes += 1

  const entropy = shannonEntropy(trimmed)
  if (hasSecretSymbol && classes >= 3 && entropy >= 3.65) {
    return true
  }
  if (trimmed.length >= 28 && classes >= 3 && entropy >= 3.9) {
    return true
  }
  return false
}

/**
 * Detects secrets, `.env` key=value blocks, private keys, API tokens, and high-entropy passwords
 * so raw sensitive clipboard/selection strings never trigger semantic recall.
 */
export function containsSensitiveSecret(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  if (isSensitiveFilePath(trimmed)) return true

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(trimmed)) return true
  }

  const envMatches = trimmed.match(ENV_ASSIGNMENT_LINE_RE)
  if (envMatches && envMatches.length >= 2) {
    return true
  }

  if (isLikelyOpaqueHighEntropySecret(trimmed)) {
    return true
  }

  return false
}

function normalizeCandidateQueryText(raw: string, minLength: number): string | null {
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed.length < minLength) return null
  if (containsSensitiveSecret(raw) || containsSensitiveSecret(collapsed)) return null
  return collapsed.slice(0, CONTEXTUAL_QUERY_MAX_LENGTH)
}

function isInformativeWindowTitle(title: string, appName?: string): boolean {
  const normalized = title.replace(/\s+/g, ' ').trim()
  if (normalized.length < MIN_WINDOW_TITLE_QUERY_LENGTH) return false
  const lowered = normalized.toLowerCase()
  if (GENERIC_WINDOW_TITLES.has(lowered)) return false
  if (appName && lowered === appName.trim().toLowerCase()) return false
  return true
}

async function defaultReadLatestClipboardText(): Promise<string | null> {
  try {
    const { clipboardModule } = await import('../../../clipboard')
    return clipboardModule.getLatestItem()?.content ?? null
  } catch {
    return null
  }
}

async function defaultReadLatestSelectionText(): Promise<string | null> {
  try {
    const { selectionSnapshotStore } = await import('../../../system/selection-snapshot-store')
    return selectionSnapshotStore.get()?.text ?? null
  } catch {
    return null
  }
}

async function defaultReadSnapshotWindowTitle(expectedBundleId: string): Promise<string | null> {
  try {
    const { foregroundAppSnapshotStore } = await import('../../../system/foreground-app-snapshot')
    const app = foregroundAppSnapshotStore.get()?.app
    if (!app || !app.bundleId) return null
    if (app.bundleId.toLowerCase() !== expectedBundleId.toLowerCase()) return null
    return app.windowTitle ?? null
  } catch {
    return null
  }
}

/**
 * Resolves a verified, secret-scrubbed contextual query from live clipboard, selection,
 * or foreground window title without ever placing raw content onto `ContextSignal`.
 */
export async function extractContextualRecallQuery(
  context: ContextSignal,
  deps: ContextualRecallDeps = {}
): Promise<string | null> {
  if (
    context.clipboard?.content &&
    context.clipboard.type === 'text' &&
    context.clipboard.contentType !== 'url' &&
    context.clipboard.meta?.isUrl !== true
  ) {
    const readClipboard = deps.readLatestClipboardText ?? defaultReadLatestClipboardText
    const rawClipboard = await readClipboard()
    if (rawClipboard && hashContextContent(rawClipboard) === context.clipboard.content) {
      if (containsSensitiveSecret(rawClipboard)) {
        return null
      }
      const query = normalizeCandidateQueryText(rawClipboard, MIN_CLIPBOARD_QUERY_LENGTH)
      if (query) return query
    }
  }

  if (
    context.selection?.content &&
    context.selection.contentType !== 'url' &&
    context.selection.meta?.isUrl !== true
  ) {
    const readSelection = deps.readLatestSelectionText ?? defaultReadLatestSelectionText
    const rawSelection = await readSelection()
    if (rawSelection && hashContextContent(rawSelection) === context.selection.content) {
      if (containsSensitiveSecret(rawSelection)) {
        return null
      }
      const query = normalizeCandidateQueryText(rawSelection, MIN_CLIPBOARD_QUERY_LENGTH)
      if (query) return query
    }
  }

  if (context.foregroundApp?.bundleId) {
    const explicitTitle = (
      context.foregroundApp as { bundleId: string; name: string; windowTitle?: unknown }
    ).windowTitle
    const readTitle = deps.readSnapshotWindowTitle ?? defaultReadSnapshotWindowTitle
    const rawTitle =
      typeof explicitTitle === 'string' && explicitTitle.trim().length > 0
        ? explicitTitle
        : await readTitle(context.foregroundApp.bundleId)

    if (rawTitle && isInformativeWindowTitle(rawTitle, context.foregroundApp.name)) {
      const query = normalizeCandidateQueryText(rawTitle, MIN_WINDOW_TITLE_QUERY_LENGTH)
      if (query) return query
    }
  }

  return null
}

function isDisallowedContextualHitPath(filePath: string): boolean {
  if (isSensitiveFilePath(filePath)) return true
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  return normalized.includes('/node_modules/') || normalized.includes('/.git/')
}

export async function recallContextualSemanticFiles(
  context: ContextSignal,
  deps: ContextualRecallDeps = {}
): Promise<ContextualSemanticFileHit[]> {
  const bridge = (deps.getBridge ?? getFileRecommendationBridge)()
  if (!bridge) return []

  const queryText = await extractContextualRecallQuery(context, deps)
  if (!queryText) return []

  const timeoutMs = deps.timeoutMs ?? CONTEXTUAL_SEMANTIC_RECALL_TIMEOUT_MS
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null

  try {
    const rawHits = await Promise.race([
      bridge.recallSemanticFiles(queryText, {
        limit: CONTEXTUAL_SEMANTIC_RECALL_LIMIT,
        minScore: CONTEXTUAL_SEMANTIC_RECALL_MIN_SCORE,
        signal: controller.signal
      }),
      new Promise<ContextualSemanticFileHit[]>((resolve) => {
        timer = setTimeout(() => {
          controller.abort()
          resolve([])
        }, timeoutMs)
      })
    ])

    const deduped = new Map<string, ContextualSemanticFileHit>()
    for (const hit of rawHits) {
      if (!hit || typeof hit.path !== 'string' || !hit.path.trim()) continue
      if (!Number.isFinite(hit.score) || hit.score < CONTEXTUAL_SEMANTIC_RECALL_MIN_SCORE) {
        continue
      }
      if (isDisallowedContextualHitPath(hit.path)) continue

      const existing = deduped.get(hit.path)
      if (!existing || hit.score > existing.score) {
        deduped.set(hit.path, hit)
      }
    }

    return [...deduped.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, CONTEXTUAL_SEMANTIC_RECALL_LIMIT)
  } catch {
    return []
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Recommendation semantic AI timeout after ${timeoutMs}ms`))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

export function toSemanticCandidateInput(
  candidate: CandidateItem
): RecommendationSemanticCandidateInput {
  return {
    sourceId: candidate.sourceId,
    itemId: candidate.itemId,
    sourceType: candidate.sourceType,
    source: candidate.source,
    title: candidate.pluginCandidate?.title,
    subtitle: candidate.pluginCandidate?.subtitle
  }
}

function isExternalPriorityCandidate(candidate: CandidateItem): boolean {
  return candidate.source === 'plugin' || candidate.sourceId === BUILTIN_CLIPBOARD_URL_SOURCE_ID
}

function getCandidateKey(candidate: CandidateItem): string {
  return `${candidate.sourceId}:${candidate.itemId}`
}

export class RecommendationSemanticScorer {
  public failures = 0
  public cooldownUntil = 0
  public pausedByUsageLimit = false

  /** Bounded 256-entry LRU cache of AI embedding vectors keyed by candidate profile text. */
  private readonly candidateEmbeddingCache = new Map<string, number[]>()

  constructor(private readonly log: SemanticScorerLogger) {}

  public get candidateEmbeddingCacheSize(): number {
    return this.candidateEmbeddingCache.size
  }

  public isInCooldown(): boolean {
    if (this.cooldownUntil === 0) return false
    if (Date.now() < this.cooldownUntil) return true
    this.cooldownUntil = 0
    this.pausedByUsageLimit = false
    this.failures = 0
    return false
  }

  public recordSuccess(): void {
    this.failures = 0
    this.cooldownUntil = 0
    this.pausedByUsageLimit = false
  }

  public recordFailure(): void {
    this.failures += 1
    if (this.failures >= SEMANTIC_AI_FAILURE_THRESHOLD) {
      this.cooldownUntil = Date.now() + SEMANTIC_AI_COOLDOWN_MS
      this.failures = 0
      this.log.debug('Semantic AI entering cooldown after repeated failures', {
        meta: { cooldownMs: SEMANTIC_AI_COOLDOWN_MS }
      })
    }
  }

  public pauseOnUsageLimit(error: unknown): boolean {
    const usageLimit = readUsageLimitInfo(error)
    if (!usageLimit) return false
    this.cooldownUntil = Math.max(this.cooldownUntil, usageLimit.resetsAt)
    this.pausedByUsageLimit = true
    this.log.debug('Semantic AI off until the AI usage limit resets', {
      meta: { limitKey: usageLimit.key, resetsAt: usageLimit.resetsAt }
    })
    return true
  }

  public liftUsageLimitPause(): boolean {
    if (!this.pausedByUsageLimit) return false
    this.pausedByUsageLimit = false
    this.cooldownUntil = 0
    this.log.debug('Semantic AI back on: the AI usage limits changed')
    return true
  }

  private getCachedCandidateEmbedding(profileText: string): number[] | undefined {
    const cached = this.candidateEmbeddingCache.get(profileText)
    if (!cached) return undefined
    this.candidateEmbeddingCache.delete(profileText)
    this.candidateEmbeddingCache.set(profileText, cached)
    return cached
  }

  private setCachedCandidateEmbedding(profileText: string, vector: number[]): void {
    if (this.candidateEmbeddingCache.has(profileText)) {
      this.candidateEmbeddingCache.delete(profileText)
    } else if (this.candidateEmbeddingCache.size >= CANDIDATE_EMBEDDING_CACHE_LIMIT) {
      const oldestKey = this.candidateEmbeddingCache.keys().next().value
      if (oldestKey !== undefined) {
        this.candidateEmbeddingCache.delete(oldestKey)
      }
    }
    this.candidateEmbeddingCache.set(profileText, vector)
  }

  public async applyAiEmbeddingScores(
    scored: ScoredItem[],
    semanticProfile: RecommendationSemanticProfile | null,
    semanticSettings: RecommendationSemanticSettings
  ): Promise<ScoredItem[]> {
    if (!semanticSettings.aiEmbeddingEnabled || !semanticProfile || scored.length === 0) {
      return scored
    }
    if (this.isInCooldown()) {
      return scored
    }

    const targets = scored
      .filter((item) => !isExternalPriorityCandidate(item))
      .slice(0, AI_EMBEDDING_CANDIDATE_LIMIT)
    if (targets.length === 0 || !semanticProfile.text) return scored

    try {
      const { tuffIntelligence } = await import('../../../ai/intelligence-sdk')
      const contextEmbedding = await withTimeout(
        tuffIntelligence.embedding.generate(
          { text: semanticProfile.text },
          {
            timeout: SEMANTIC_AI_TIMEOUT_MS,
            metadata: { caller: 'core.recommendation.semantic-embedding' }
          }
        ),
        SEMANTIC_AI_TIMEOUT_MS
      )

      const inflightByText = new Map<string, Promise<number[]>>()
      const embeddings = await Promise.all(
        targets.map(async (item) => {
          const candidateProfile = buildCandidateSemanticProfile(toSemanticCandidateInput(item))
          if (!candidateProfile.text) return null

          let candidateVector = this.getCachedCandidateEmbedding(candidateProfile.text)
          if (!candidateVector) {
            let pending = inflightByText.get(candidateProfile.text)
            if (!pending) {
              pending = withTimeout(
                tuffIntelligence.embedding.generate(
                  { text: candidateProfile.text },
                  {
                    timeout: SEMANTIC_AI_TIMEOUT_MS,
                    metadata: { caller: 'core.recommendation.semantic-embedding' }
                  }
                ),
                SEMANTIC_AI_TIMEOUT_MS
              ).then((result) => {
                this.setCachedCandidateEmbedding(candidateProfile.text, result.result)
                return result.result
              })
              inflightByText.set(candidateProfile.text, pending)
            }
            candidateVector = await pending
          }

          return {
            key: getCandidateKey(item),
            score: calculateVectorCosine(contextEmbedding.result, candidateVector)
          }
        })
      )

      this.recordSuccess()

      const scoreMap = new Map<string, number>()
      for (const embedding of embeddings) {
        if (!embedding) continue
        scoreMap.set(embedding.key, embedding.score)
      }

      if (scoreMap.size === 0) return scored
      return scored
        .map((item) => ({
          ...item,
          score:
            item.score + (scoreMap.get(getCandidateKey(item)) ?? 0) * SEMANTIC_AI_EMBEDDING_WEIGHT
        }))
        .sort((a, b) => b.score - a.score)
    } catch (error) {
      if (!this.pauseOnUsageLimit(error)) this.recordFailure()
      this.log.debug('AI embedding recommendation score skipped', {
        meta: toErrorMeta(error)
      })
      return scored
    }
  }

  public async applyAiRerank(
    scored: ScoredItem[],
    semanticProfile: RecommendationSemanticProfile | null,
    semanticSettings: RecommendationSemanticSettings
  ): Promise<ScoredItem[]> {
    if (!semanticSettings.aiRerankEnabled || !semanticProfile || scored.length === 0) {
      return scored
    }
    if (this.isInCooldown()) {
      return scored
    }

    const targets = scored.slice(0, AI_RERANK_CANDIDATE_LIMIT)
    if (targets.length === 0 || !semanticProfile.text) return scored

    try {
      const { tuffIntelligence } = await import('../../../ai/intelligence-sdk')
      const result = await withTimeout(
        tuffIntelligence.rag.rerank(
          {
            query: semanticProfile.text,
            documents: targets.map((item) => {
              const candidateProfile = buildCandidateSemanticProfile(toSemanticCandidateInput(item))
              return {
                id: getCandidateKey(item),
                content: candidateProfile.text || item.itemId,
                metadata: {
                  source: item.source,
                  sourceId: item.sourceId,
                  sourceType: item.sourceType
                }
              }
            }),
            topK: targets.length
          },
          {
            timeout: SEMANTIC_AI_TIMEOUT_MS,
            metadata: { caller: 'core.recommendation.semantic-rerank' }
          }
        ),
        SEMANTIC_AI_TIMEOUT_MS
      )

      this.recordSuccess()

      const scoreMap = new Map<string, number>()
      const orderMap = new Map<string, number>()
      result.result.results.forEach((item, index) => {
        scoreMap.set(item.id, item.score)
        orderMap.set(item.id, targets.length - index)
      })

      if (scoreMap.size === 0) return scored
      return scored
        .map((item) => {
          const key = getCandidateKey(item)
          const rerankScore = scoreMap.get(key) ?? 0
          const orderScore = orderMap.get(key) ?? 0
          return {
            ...item,
            score:
              item.score +
              rerankScore * SEMANTIC_AI_RERANK_WEIGHT +
              orderScore * SEMANTIC_AI_RERANK_ORDER_WEIGHT
          }
        })
        .sort((a, b) => b.score - a.score)
    } catch (error) {
      if (!this.pauseOnUsageLimit(error)) this.recordFailure()
      this.log.debug('AI recommendation rerank skipped', {
        meta: toErrorMeta(error)
      })
      return scored
    }
  }

  public async recallContextualFiles(
    context: ContextSignal,
    deps?: ContextualRecallDeps
  ): Promise<ContextualSemanticFileHit[]> {
    return await recallContextualSemanticFiles(context, deps)
  }
}
