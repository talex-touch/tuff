import type {
  IntelligenceCodeReviewPayload,
  IntelligenceCodeReviewResult,
  IntelligenceEmbeddingPayload,
  IntelligenceImageCaptionPayload,
  IntelligenceImageCaptionResult,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceRerankPayload,
  IntelligenceRerankResult,
  IntelligenceRewritePayload,
  IntelligenceSummarizePayload,
  IntelligenceTranslatePayload,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult
} from '@talex-touch/tuff-intelligence'
import type { IntelligenceErrorCode } from '@talex-touch/utils/transport/events/types'
import type { UsageLimits } from '@talex-touch/utils/transport/sdk/domains/intelligence'

export type BoxToolUsageLimitKey = keyof UsageLimits
export type BoxToolEmbeddingPriority = 'interactive' | 'background'

export interface BoxToolUsageLimitInfo {
  key: BoxToolUsageLimitKey
  used: number
  max: number
  resetsAt: number
}

export type BoxToolUsageLimitError = Error & {
  code: 'USAGE_LIMIT_REACHED'
  usageLimit: BoxToolUsageLimitInfo
}

export interface BoxToolNormalizedIntelligenceError {
  code: IntelligenceErrorCode
  message: string
  reason: string
  recovery: string
  capabilityId?: string
}

export interface BoxToolCapabilityStatusSnapshot {
  capabilityId: string
  available: boolean
  providerIds: string[]
  reason?: string
}

export interface BoxToolConversationSearchHit {
  id: string
  title: string
  updatedAt: number
  excerpt: string
}

export interface BoxToolLocalEmbeddingImageInput {
  readonly path: string
  readonly mtime: number
  readonly size: number
}

export type BoxToolHostIntelligenceInvokeOptions = IntelligenceInvokeOptions & {
  signal?: AbortSignal
}

export interface BoxToolIntelligenceInvoker {
  code: {
    review(
      payload: IntelligenceCodeReviewPayload,
      options?: IntelligenceInvokeOptions
    ): Promise<IntelligenceInvokeResult<IntelligenceCodeReviewResult>>
  }
  text: {
    summarize(
      payload: IntelligenceSummarizePayload,
      options?: IntelligenceInvokeOptions
    ): Promise<IntelligenceInvokeResult<string>>
    rewrite(
      payload: IntelligenceRewritePayload,
      options?: IntelligenceInvokeOptions
    ): Promise<IntelligenceInvokeResult<string>>
    translate(
      payload: IntelligenceTranslatePayload,
      options?: IntelligenceInvokeOptions
    ): Promise<IntelligenceInvokeResult<string>>
  }
  vision: {
    ocr(
      payload: IntelligenceVisionOcrPayload,
      options?: BoxToolHostIntelligenceInvokeOptions
    ): Promise<IntelligenceInvokeResult<IntelligenceVisionOcrResult>>
    caption(
      payload: IntelligenceImageCaptionPayload,
      options?: IntelligenceInvokeOptions
    ): Promise<IntelligenceInvokeResult<IntelligenceImageCaptionResult>>
  }
  embedding: {
    generate(
      payload: IntelligenceEmbeddingPayload,
      options?: BoxToolHostIntelligenceInvokeOptions
    ): Promise<IntelligenceInvokeResult<number[]>>
    generateLocalImage(
      input: BoxToolLocalEmbeddingImageInput,
      options?: BoxToolHostIntelligenceInvokeOptions
    ): Promise<IntelligenceInvokeResult<number[]>>
  }
  rag: {
    rerank(
      payload: IntelligenceRerankPayload,
      options?: IntelligenceInvokeOptions
    ): Promise<IntelligenceInvokeResult<IntelligenceRerankResult>>
  }
}

export interface BoxToolAiCapabilityPort {
  intelligence: BoxToolIntelligenceInvoker
  normalizeIntelligenceError(
    error: unknown,
    options?: { capabilityId?: string }
  ): BoxToolNormalizedIntelligenceError
  resolveCapabilityStatus(capabilityId: string): BoxToolCapabilityStatusSnapshot
  searchConversations(term: string): Promise<BoxToolConversationSearchHit[]>
  isLocalEmbeddingReady(): boolean
  isLocalEmbeddingImageReady(): boolean
  getLocalEmbeddingModelKey(): string
  runWithEmbeddingPriority<T>(priority: BoxToolEmbeddingPriority, run: () => T): T
  onUsageLimitsChanged(listener: (limits: UsageLimits) => void): () => void
  notifyUsageLimitsChanged?(limits: UsageLimits): void
  readUsageLimitInfo(error: unknown): BoxToolUsageLimitInfo | null
}

const USAGE_LIMIT_REACHED_CODE = 'USAGE_LIMIT_REACHED' as const
const USAGE_LIMIT_KEYS: ReadonlySet<string> = new Set<BoxToolUsageLimitKey>([
  'requestsPerDay',
  'requestsPerMonth',
  'tokensPerDay',
  'tokensPerMonth',
  'costUsdPerDay',
  'costUsdPerMonth'
])

let activePort: BoxToolAiCapabilityPort | null = null
let disposePortUsageLimitBridge: (() => void) | null = null
const usageLimitListeners = new Set<(limits: UsageLimits) => void>()

function dispatchLocalUsageLimitsChanged(limits: UsageLimits): void {
  for (const listener of [...usageLimitListeners]) {
    try {
      listener({ ...limits })
    } catch {
      // Listener errors must never block sibling subscribers.
    }
  }
}

export function createEmptyBoxToolUsageLimits(): UsageLimits {
  return {
    requestsPerDay: null,
    requestsPerMonth: null,
    tokensPerDay: null,
    tokensPerMonth: null,
    costUsdPerDay: null,
    costUsdPerMonth: null
  }
}

export function createBoxToolUsageLimitError(
  capabilityId: string,
  info: BoxToolUsageLimitInfo
): BoxToolUsageLimitError {
  const resetsAtIso = new Date(info.resetsAt).toISOString()
  return Object.assign(
    new Error(
      `[${USAGE_LIMIT_REACHED_CODE}:${capabilityId}] Usage limit reached: ${info.key}; resets at ${resetsAtIso}`
    ),
    { code: USAGE_LIMIT_REACHED_CODE, usageLimit: { ...info } }
  )
}

function readStructuralUsageLimitInfo(error: unknown): BoxToolUsageLimitInfo | null {
  let current: unknown = error
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; usageLimit?: unknown; cause?: unknown }
    if (
      candidate.code === USAGE_LIMIT_REACHED_CODE &&
      candidate.usageLimit &&
      typeof candidate.usageLimit === 'object'
    ) {
      const info = candidate.usageLimit as Record<string, unknown>
      if (
        typeof info.key === 'string' &&
        USAGE_LIMIT_KEYS.has(info.key) &&
        typeof info.used === 'number' &&
        Number.isFinite(info.used) &&
        typeof info.max === 'number' &&
        Number.isFinite(info.max) &&
        typeof info.resetsAt === 'number' &&
        Number.isFinite(info.resetsAt)
      ) {
        return {
          key: info.key as BoxToolUsageLimitKey,
          used: info.used,
          max: info.max,
          resetsAt: info.resetsAt
        }
      }
    }
    current = candidate.cause
  }
  return null
}

function fallbackNormalizeIntelligenceError(
  error: unknown,
  options: { capabilityId?: string } = {}
): BoxToolNormalizedIntelligenceError {
  const message = error instanceof Error ? error.message || error.name : String(error)
  const lower = message.toLowerCase()
  const explicitCode =
    error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? String((error as { code: string }).code)
      : ''

  if (explicitCode === 'NEXUS_AUTH_REQUIRED' || lower.includes('nexus_auth_required')) {
    return {
      code: 'NEXUS_AUTH_REQUIRED',
      message,
      reason: 'Nexus provider requires a signed-in account.',
      recovery: 'Sign in to Nexus or switch to another enabled provider.',
      capabilityId: options.capabilityId
    }
  }

  if (explicitCode === USAGE_LIMIT_REACHED_CODE || lower.includes('usage_limit_reached')) {
    return {
      code: USAGE_LIMIT_REACHED_CODE,
      message,
      reason: 'The usage limit you set is reached.',
      recovery:
        'Wait until the limit resets, or raise or clear it in Settings › Intelligence › Audit.',
      capabilityId: options.capabilityId
    }
  }

  if (
    explicitCode === 'PERMISSION_DENIED' ||
    explicitCode === 'INTELLIGENCE_PERMISSION_DENIED' ||
    lower.includes('permission denied') ||
    lower.includes('permission_denied')
  ) {
    return {
      code: 'PERMISSION_DENIED',
      message,
      reason: 'The caller is not allowed to use this intelligence capability or provider.',
      recovery: 'Grant the required permission or choose an allowed provider/capability.',
      capabilityId: options.capabilityId
    }
  }

  return {
    code: 'UNKNOWN',
    message,
    reason: 'The intelligence request failed with an unclassified error.',
    recovery: 'Retry the request or inspect the trace/audit entry.',
    capabilityId: options.capabilityId
  }
}

export function registerBoxToolAiCapabilityPort(port: BoxToolAiCapabilityPort): () => void {
  disposePortUsageLimitBridge?.()
  disposePortUsageLimitBridge = null

  activePort = port
  disposePortUsageLimitBridge = port.onUsageLimitsChanged((limits) => {
    dispatchLocalUsageLimitsChanged(limits)
  })

  return () => {
    if (activePort === port) {
      disposePortUsageLimitBridge?.()
      disposePortUsageLimitBridge = null
      activePort = null
    }
  }
}

export function getBoxToolAiCapabilityPort(): BoxToolAiCapabilityPort | null {
  return activePort
}

export function resetBoxToolAiCapabilityPort(): void {
  disposePortUsageLimitBridge?.()
  disposePortUsageLimitBridge = null
  activePort = null
}

export function requireBoxToolIntelligence(): BoxToolIntelligenceInvoker {
  if (!activePort) {
    throw new Error('Provider unavailable: AI capability port is not registered')
  }
  return activePort.intelligence
}

export function normalizeBoxToolIntelligenceError(
  error: unknown,
  options?: { capabilityId?: string }
): BoxToolNormalizedIntelligenceError {
  if (activePort) {
    return activePort.normalizeIntelligenceError(error, options)
  }
  return fallbackNormalizeIntelligenceError(error, options)
}

export function resolveBoxToolCapabilityStatus(
  capabilityId: string
): BoxToolCapabilityStatusSnapshot {
  if (activePort) {
    return activePort.resolveCapabilityStatus(capabilityId)
  }
  return {
    capabilityId,
    available: false,
    providerIds: [],
    reason: 'intelligence-unavailable'
  }
}

export async function searchBoxToolConversations(
  term: string
): Promise<BoxToolConversationSearchHit[]> {
  if (!activePort) {
    return []
  }
  return await activePort.searchConversations(term)
}

export function isBoxToolLocalEmbeddingReady(): boolean {
  return activePort?.isLocalEmbeddingReady() ?? false
}

export function isBoxToolLocalEmbeddingImageReady(): boolean {
  return activePort?.isLocalEmbeddingImageReady() ?? false
}

export function getBoxToolLocalEmbeddingModelKey(): string | null {
  return activePort?.getLocalEmbeddingModelKey() ?? null
}

export function runBoxToolWithEmbeddingPriority<T>(
  priority: BoxToolEmbeddingPriority,
  run: () => T
): T {
  if (activePort) {
    return activePort.runWithEmbeddingPriority(priority, run)
  }
  return run()
}

export function subscribeBoxToolUsageLimitsChanged(
  listener: (limits: UsageLimits) => void
): () => void {
  usageLimitListeners.add(listener)
  return () => {
    usageLimitListeners.delete(listener)
  }
}

export function notifyBoxToolUsageLimitsChanged(
  limits: UsageLimits = createEmptyBoxToolUsageLimits()
): void {
  if (activePort?.notifyUsageLimitsChanged) {
    activePort.notifyUsageLimitsChanged(limits)
    return
  }
  dispatchLocalUsageLimitsChanged(limits)
}

export function readBoxToolUsageLimitInfo(error: unknown): BoxToolUsageLimitInfo | null {
  if (activePort) {
    return activePort.readUsageLimitInfo(error)
  }
  return readStructuralUsageLimitInfo(error)
}
