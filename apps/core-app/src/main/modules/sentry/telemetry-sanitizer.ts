import type * as Sentry from '@sentry/electron/main'

type NexusTelemetryEventType = 'search' | 'visit' | 'error' | 'feature_use' | 'performance'

export interface SanitizableNexusTelemetryEvent {
  eventType: NexusTelemetryEventType
  clientId?: string
  userId?: string
  platform?: string
  version?: string
  region?: string
  searchQuery?: string
  searchDurationMs?: number
  searchResultCount?: number
  providerTimings?: Record<string, number>
  inputTypes?: string[]
  metadata?: Record<string, unknown>
  isAnonymous: boolean
}

const MAX_STRING_LENGTH = 128
const MAX_METADATA_KEY_LENGTH = 64
const MAX_SEARCH_DURATION_MS = 5 * 60 * 1000
const MAX_SEARCH_RESULT_COUNT = 100_000
const MAX_PROVIDER_COUNT = 50
const PROVIDER_STATUS_VALUES = new Set(['success', 'timeout', 'error', 'aborted'])

const SEARCH_STRING_FIELDS = new Map([
  ['sessionId', 64],
  ['queryType', 32],
  ['searchScene', 48],
  ['providerFilter', 64]
])

const SEARCH_DURATION_FIELDS = new Set([
  'firstResultMs',
  'totalDurationMs',
  'sortingDuration',
  'usageStatsDuration',
  'completionDuration',
  'parseDuration',
  'providerAggregationDuration',
  'mergeRankDuration'
])

const SEARCH_COUNT_FIELDS = new Set([
  'firstResultCount',
  'queryLength',
  'providerErrorCount',
  'providerTimeoutCount'
])

const FEATURE_STRING_FIELDS = new Map([
  ['action', 64],
  ['stage', 32],
  ['result', 32],
  ['family', 32],
  ['legacyEvent', 96],
  ['canonicalEvent', 96],
  ['direction', 32],
  ['sourceModule', 96],
  ['sourceType', 64],
  ['sourceId', 96],
  ['sourceVersion', 64],
  ['itemKind', 48],
  ['pluginName', 96],
  ['pluginVersion', 64],
  ['featureId', 96],
  ['usageCategoryL1', 48],
  ['usageCategoryL2', 48]
])

const PERFORMANCE_STRING_FIELDS = new Map([
  ['kind', 64],
  ['severity', 16],
  ['eventName', 96],
  ['direction', 16],
  ['perfSource', 16],
  ['phase', 32],
  ['moduleKey', 96],
  ['moduleName', 96],
  ['status', 16]
])

const PERFORMANCE_NUMBER_FIELDS = new Set([
  'durationMs',
  'eventLoopDelayP95Ms',
  'eventLoopDelayMaxMs',
  'unresponsiveCount',
  'unresponsiveTotalMs',
  'unresponsiveMaxMs',
  'longTaskTotalMs',
  'longTaskCount',
  'longTaskMaxMs',
  'rafJankTotalMs',
  'rafJankCount',
  'rafJankMaxMs',
  'windowMs',
  'sampleLimit'
])

const OPERATIONAL_ERROR_STRING_FIELDS = new Map([
  ['domain', 64],
  ['operation', 96],
  ['code', 96],
  ['userImpact', 24]
])

const OPERATIONAL_ERROR_NUMBER_FIELDS = new Map([
  ['occurrenceCount', 1_000_000],
  ['busyRetryDelta', 1_000_000],
  ['schedulerBusyFailureDelta', 1_000_000],
  ['schedulerQueueDepth', 1_000_000],
  ['schedulerQueuePeak', 1_000_000],
  ['writerPending', 1_000_000],
  ['writerActive', 1_000_000],
  ['walSizeBytes', 1024 ** 4],
  ['openFdCount', 1_000_000],
  ['attempts', 1_000],
  ['elapsedMs', 60 * 60 * 1000],
  ['rawCode', 1_000_000]
])

const SENSITIVE_KEY_PATTERN =
  /(query|text|keyword|path|file|folder|url|email|token|secret|password|credential|clipboard|content|prompt|response|html|image|screenshot|body|payload|stack|trace|meta|errorMessage|request|headers|cookie)/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_.:-]+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_EVENT_MESSAGE = 'redacted'

function normalizeString(value: unknown, maxLength = MAX_STRING_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || EMAIL_PATTERN.test(trimmed)) return undefined
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function normalizeIdentifier(value: unknown): string | undefined {
  const normalized = normalizeString(value, MAX_STRING_LENGTH)
  if (!normalized || !SAFE_ID_PATTERN.test(normalized)) return undefined
  return normalized
}

function normalizeNumber(
  value: unknown,
  options: { min?: number; max?: number } = {}
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const min = options.min ?? -Infinity
  const max = options.max ?? Infinity
  if (value < min || value > max) return undefined
  return Math.round(value)
}

function sanitizeStringArray(value: unknown, limit = 20): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .map((item) => normalizeString(item, 64))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit)
  return items.length ? items : undefined
}

function sanitizeProviderNumberMap(
  value: unknown,
  max = MAX_SEARCH_RESULT_COUNT
): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries: Array<[string, number]> = []
  for (const [key, raw] of Object.entries(value).slice(0, MAX_PROVIDER_COUNT)) {
    const normalizedKey = normalizeString(key, MAX_METADATA_KEY_LENGTH)
    const numberValue = normalizeNumber(raw, { min: 0, max })
    if (normalizedKey && numberValue !== undefined) {
      entries.push([normalizedKey, numberValue])
    }
  }
  return entries.length ? Object.fromEntries(entries) : undefined
}

function sanitizeProviderStatusMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries: Array<[string, string]> = []
  for (const [key, raw] of Object.entries(value).slice(0, MAX_PROVIDER_COUNT)) {
    const normalizedKey = normalizeString(key, MAX_METADATA_KEY_LENGTH)
    const status = normalizeString(raw, 16)
    if (normalizedKey && status && PROVIDER_STATUS_VALUES.has(status)) {
      entries.push([normalizedKey, status])
    }
  }
  return entries.length ? Object.fromEntries(entries) : undefined
}

function sanitizePerfStats(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const output: Record<string, number> = {}
  for (const key of ['count', 'avgMs', 'p95Ms', 'maxMs']) {
    const normalized = normalizeNumber((value as Record<string, unknown>)[key], {
      min: 0,
      max: MAX_SEARCH_DURATION_MS
    })
    if (normalized !== undefined) output[key] = normalized
  }
  return Object.keys(output).length ? output : undefined
}

function sanitizePerfStatsByLayer(
  value: unknown
): Record<string, Record<string, number>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const output: Record<string, Record<string, number>> = {}
  for (const [key, raw] of Object.entries(value).slice(0, 10)) {
    const normalizedKey = normalizeString(key, 32)
    const stats = sanitizePerfStats(raw)
    if (normalizedKey && stats) output[normalizedKey] = stats
  }
  return Object.keys(output).length ? output : undefined
}

function sanitizeSearchMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  const output: Record<string, unknown> = {}

  for (const [field, maxLength] of SEARCH_STRING_FIELDS) {
    const normalized = normalizeString(metadata[field], maxLength)
    if (normalized) output[field] = normalized
  }

  if (typeof metadata.hasFilters === 'boolean') output.hasFilters = metadata.hasFilters

  for (const field of SEARCH_DURATION_FIELDS) {
    const normalized = normalizeNumber(metadata[field], { min: 0, max: MAX_SEARCH_DURATION_MS })
    if (normalized !== undefined) output[field] = normalized
  }

  for (const field of SEARCH_COUNT_FIELDS) {
    const normalized = normalizeNumber(metadata[field], { min: 0, max: MAX_SEARCH_RESULT_COUNT })
    if (normalized !== undefined) output[field] = normalized
  }

  const filterKinds = sanitizeStringArray(metadata.filterKinds)
  if (filterKinds) output.filterKinds = filterKinds
  const filterSources = sanitizeStringArray(metadata.filterSources)
  if (filterSources) output.filterSources = filterSources

  const providerResults = sanitizeProviderNumberMap(metadata.providerResults)
  if (providerResults) output.providerResults = providerResults
  const resultCategories = sanitizeProviderNumberMap(metadata.resultCategories)
  if (resultCategories) output.resultCategories = resultCategories
  const providerStatus = sanitizeProviderStatusMap(metadata.providerStatus)
  if (providerStatus) output.providerStatus = providerStatus

  return Object.keys(output).length ? output : undefined
}

function sanitizeFeatureUseMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  const output: Record<string, unknown> = {}

  for (const [field, maxLength] of FEATURE_STRING_FIELDS) {
    const normalized = normalizeString(metadata[field], maxLength)
    if (normalized) output[field] = normalized
  }

  const executeLatencyMs = normalizeNumber(metadata.executeLatencyMs, {
    min: 0,
    max: MAX_SEARCH_DURATION_MS
  })
  if (executeLatencyMs !== undefined) output.executeLatencyMs = executeLatencyMs

  const timestamp = normalizeNumber(metadata.timestamp, {
    min: 0,
    max: Number.MAX_SAFE_INTEGER
  })
  if (timestamp !== undefined) output.timestamp = timestamp

  return Object.keys(output).length ? output : undefined
}

function sanitizePerformanceMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  const output: Record<string, unknown> = {}

  for (const [field, maxLength] of PERFORMANCE_STRING_FIELDS) {
    const normalized = normalizeString(metadata[field], maxLength)
    if (normalized) output[field] = normalized
  }
  const reason = normalizeIdentifier(metadata.reason)
  if (reason) output.reason = reason

  for (const field of PERFORMANCE_NUMBER_FIELDS) {
    const normalized = normalizeNumber(metadata[field], { min: 0, max: MAX_SEARCH_DURATION_MS })
    if (normalized !== undefined) output[field] = normalized
  }

  const cacheLayerCounts = sanitizeProviderNumberMap(metadata.cacheLayerCounts, 1_000_000)
  if (cacheLayerCounts) output.cacheLayerCounts = cacheLayerCounts

  const total = sanitizePerfStats(metadata.total)
  if (total) output.total = total
  const totalAll = sanitizePerfStats(metadata.totalAll)
  if (totalAll) output.totalAll = totalAll
  const trending = sanitizePerfStats(metadata.trending)
  if (trending) output.trending = trending
  const totalByCacheLayer = sanitizePerfStatsByLayer(metadata.totalByCacheLayer)
  if (totalByCacheLayer) output.totalByCacheLayer = totalByCacheLayer

  return Object.keys(output).length ? output : undefined
}

function sanitizeErrorMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  const output = sanitizePerformanceMetadata(metadata) ?? {}
  for (const [field, maxLength] of OPERATIONAL_ERROR_STRING_FIELDS) {
    const normalized = normalizeString(metadata[field], maxLength)
    if (normalized) output[field] = normalized
  }
  for (const [field, max] of OPERATIONAL_ERROR_NUMBER_FIELDS) {
    const normalized = normalizeNumber(metadata[field], { min: 0, max })
    if (normalized !== undefined) output[field] = normalized
  }
  if (typeof metadata.retryable === 'boolean') output.retryable = metadata.retryable
  if (typeof metadata.writerAdmissionPaused === 'boolean') {
    output.writerAdmissionPaused = metadata.writerAdmissionPaused
  }
  return Object.keys(output).length ? output : undefined
}

/**
 * Sanitize a CoreBox focus telemetry metadata block.
 *
 * Only the allowlisted fields (kind, code, stage, success, summonId, sampleIndex)
 * are accepted. Any other key — even if it would normally pass through a generic
 * or performance sanitizer — is rejected entirely, so callers cannot smuggle raw
 * data through the metadata channel.
 */
const COREBOX_FOCUS_METADATA_KEYS = new Set([
  'kind',
  'code',
  'stage',
  'success',
  'summonId',
  'sampleIndex'
])

const COREBOX_FOCUS_KINDS = new Set(['summon', 'dismiss', 'blur_hide', 'focus', 'pin'])
const COREBOX_FOCUS_STAGES = new Set([
  'attempted',
  'grace_started',
  'shown',
  'focus_granted',
  'focus_denied',
  'focus_failed',
  'hidden',
  'cancelled',
  'aborted'
])
const COREBOX_FOCUS_CODES = new Set([
  'window_not_ready',
  'window_destroyed',
  'create_failed',
  'already_visible',
  'already_hidden',
  'grace_suppressed',
  'onboarding_blocked',
  'focus_error',
  'unexpected_active_element',
  'missing_target',
  'native_transport_error',
  'ok',
  'cancelled_by_user',
  'cancelled_by_shortcut_toggle',
  'cancelled_by_blur'
])

function sanitizeCoreBoxFocusMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata) return undefined

  // Reject any metadata that contains keys outside the allowlist — this is the
  // focus telemetry channel, not a general-purpose metadata bucket.
  const keys = Object.keys(metadata)
  if (keys.length === 0) return undefined
  for (const key of keys) {
    if (!COREBOX_FOCUS_METADATA_KEYS.has(key)) return undefined
  }

  const output: Record<string, unknown> = {}

  const kind = normalizeString(metadata.kind, 64)
  if (!kind || !COREBOX_FOCUS_KINDS.has(kind)) return undefined
  output.kind = kind

  const code = normalizeString(metadata.code, 96)
  if (!code || !COREBOX_FOCUS_CODES.has(code)) return undefined
  output.code = code

  const stage = normalizeString(metadata.stage, 32)
  if (!stage || !COREBOX_FOCUS_STAGES.has(stage)) return undefined
  output.stage = stage

  if (typeof metadata.success !== 'boolean') return undefined
  output.success = metadata.success

  const summonId = metadata.summonId
  if (typeof summonId !== 'string' || !UUID_PATTERN.test(summonId)) return undefined
  output.summonId = summonId

  const sampleIndex = normalizeNumber(metadata.sampleIndex, { min: 0, max: 1_000_000 })
  if (sampleIndex === undefined) return undefined
  output.sampleIndex = sampleIndex

  return output
}

function sanitizePerformanceOrFocusMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const focus = sanitizeCoreBoxFocusMetadata(metadata)
  if (focus) return focus
  return sanitizePerformanceMetadata(metadata)
}

function sanitizeErrorOrFocusMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const focus = sanitizeCoreBoxFocusMetadata(metadata)
  if (focus) return focus
  return sanitizeErrorMetadata(metadata)
}

function sanitizeGenericMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  const output: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(metadata).slice(0, 30)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue
    const normalizedKey = normalizeString(key, MAX_METADATA_KEY_LENGTH)
    if (!normalizedKey) continue
    if (typeof raw === 'boolean') {
      output[normalizedKey] = raw
    } else if (typeof raw === 'number') {
      const normalized = normalizeNumber(raw, { min: 0, max: MAX_SEARCH_DURATION_MS })
      if (normalized !== undefined) output[normalizedKey] = normalized
    } else if (typeof raw === 'string') {
      const normalized = normalizeString(raw, 96)
      if (normalized) output[normalizedKey] = normalized
    }
  }
  return Object.keys(output).length ? output : undefined
}

function sanitizeMetadata(
  eventType: NexusTelemetryEventType,
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (eventType === 'search') return sanitizeSearchMetadata(metadata)
  if (eventType === 'feature_use') return sanitizeFeatureUseMetadata(metadata)
  if (eventType === 'performance') return sanitizePerformanceOrFocusMetadata(metadata)
  if (eventType === 'error') return sanitizeErrorOrFocusMetadata(metadata)
  return sanitizeGenericMetadata(metadata)
}

export function sanitizeNexusTelemetryEvent(
  event: SanitizableNexusTelemetryEvent
): SanitizableNexusTelemetryEvent | null {
  const metadata = sanitizeMetadata(event.eventType, event.metadata)
  const providerTimings = sanitizeProviderNumberMap(event.providerTimings, MAX_SEARCH_DURATION_MS)
  const inputTypes = sanitizeStringArray(event.inputTypes, 10)
  const userId = event.isAnonymous ? undefined : normalizeIdentifier(event.userId)

  return {
    eventType: event.eventType,
    clientId: normalizeIdentifier(event.clientId),
    userId,
    platform: normalizeString(event.platform, 32),
    version: normalizeString(event.version, 64),
    region: normalizeString(event.region, 8),
    searchQuery: undefined,
    searchDurationMs: normalizeNumber(event.searchDurationMs, {
      min: 0,
      max: MAX_SEARCH_DURATION_MS
    }),
    searchResultCount: normalizeNumber(event.searchResultCount, {
      min: 0,
      max: MAX_SEARCH_RESULT_COUNT
    }),
    providerTimings,
    inputTypes,
    metadata,
    isAnonymous: !userId
  }
}

function sanitizeCoreBoxFocusContext(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const output: Record<string, unknown> = {}

  // Only UUID-shaped summonId and bounded sampleIndex pass through — both are
  // correlation IDs, never free-form text or PII.
  const raw = value as Record<string, unknown>
  const summonId = raw.summonId
  if (typeof summonId === 'string' && UUID_PATTERN.test(summonId)) {
    output.summonId = summonId
  }
  const sampleIndex = raw.sampleIndex
  if (typeof sampleIndex === 'number' && Number.isFinite(sampleIndex) && sampleIndex >= 0) {
    output.sampleIndex = Math.min(Math.floor(sampleIndex), 1_000_000)
  }

  return Object.keys(output).length ? output : undefined
}

function sanitizeSentryContext(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const output: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(value).slice(0, 30)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue
    const normalizedKey = normalizeString(key, MAX_METADATA_KEY_LENGTH)
    if (!normalizedKey) continue
    if (typeof raw === 'boolean') output[normalizedKey] = raw
    if (typeof raw === 'number') {
      const normalized = normalizeNumber(raw, { min: 0, max: MAX_SEARCH_DURATION_MS })
      if (normalized !== undefined) output[normalizedKey] = normalized
    }
    if (typeof raw === 'string') {
      // Context values are stable identifiers only (versions, codes, channels);
      // free-form text must never leave the process.
      const normalized = normalizeIdentifier(raw)
      if (normalized) output[normalizedKey] = normalized
    }
  }
  return Object.keys(output).length ? output : undefined
}

export function sanitizeSentryEvent<T extends Sentry.Event>(event: T): T {
  delete event.request
  delete event.breadcrumbs
  delete event.extra
  delete event.modules
  delete event.server_name
  delete event.transaction
  delete event.spans
  delete event.logentry

  if (event.tags) {
    const tags: Record<string, string> = {}
    for (const [key, raw] of Object.entries(event.tags)) {
      const normalizedKey = normalizeIdentifier(key)
      const normalizedValue = normalizeIdentifier(raw)
      if (normalizedKey && normalizedValue) tags[normalizedKey] = normalizedValue
    }
    event.tags = tags
  }

  event.user = event.user?.id
    ? {
        id: normalizeIdentifier(event.user.id),
        username: undefined,
        email: undefined,
        ip_address: undefined
      }
    : undefined

  if (event.message) event.message = SAFE_EVENT_MESSAGE

  if (event.contexts) {
    const environment = sanitizeSentryContext(event.contexts.environment)
    const operational = sanitizeSentryContext(event.contexts.operational)
    const coreboxFocus = sanitizeCoreBoxFocusContext(event.contexts.corebox_focus)
    event.contexts = {
      ...(environment ? { environment: environment as Record<string, unknown> } : {}),
      ...(operational ? { operational: operational as Record<string, unknown> } : {}),
      ...(coreboxFocus ? { corebox_focus: coreboxFocus as Record<string, unknown> } : {})
    }
    if (Object.keys(event.contexts).length === 0) event.contexts = undefined
  }

  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = SAFE_EVENT_MESSAGE
    // Exception module names and mechanism data may embed raw SQL, params, or
    // paths from the underlying driver error; only the classification type
    // and sanitized frames may leave the process.
    delete value.module
    delete value.mechanism
    for (const frame of value.stacktrace?.frames ?? []) {
      delete frame.filename
      delete frame.abs_path
      delete frame.context_line
      delete frame.pre_context
      delete frame.post_context
      delete frame.vars
    }
  }

  return event
}
