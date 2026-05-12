export interface TelemetryEvent {
  id: string
  eventType: 'search' | 'visit' | 'error' | 'feature_use' | 'performance'
  userId?: string
  clientId?: string
  deviceFingerprint?: string
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
  createdAt: string
}

export interface TelemetryEventInput {
  eventType?: unknown
  userId?: unknown
  clientId?: unknown
  deviceFingerprint?: unknown
  platform?: unknown
  version?: unknown
  region?: unknown
  searchQuery?: unknown
  searchDurationMs?: unknown
  searchResultCount?: unknown
  providerTimings?: unknown
  inputTypes?: unknown
  metadata?: unknown
  isAnonymous?: unknown
}

export interface NormalizedTelemetryResult {
  telemetry: Omit<TelemetryEvent, 'id' | 'createdAt'> | null
  reason?: string
}

const ALLOWED_EVENT_TYPES = new Set([
  'search',
  'visit',
  'error',
  'feature_use',
  'performance',
])

const MAX_STRING_LENGTH = 128
export const MAX_METADATA_STRING_LENGTH = 256
const MAX_METADATA_KEYS = 50
const MAX_METADATA_KEY_LENGTH = 64
const MAX_METADATA_DEPTH = 4
const MAX_METADATA_BYTES = 16_384
const MAX_QUARANTINE_PAYLOAD_BYTES = 8_192
const MAX_INPUT_TYPES = 10
const MAX_PROVIDER_TIMINGS = 50
export const MAX_SEARCH_DURATION_MS = 5 * 60 * 1000
export const MAX_PROVIDER_DURATION_MS = 5 * 60 * 1000
export const MAX_SEARCH_RESULT_COUNT = 100_000
export const PROVIDER_STATUS_VALUES = new Set(['success', 'timeout', 'error', 'aborted'])

const REDACTED_METADATA_KEYS = new Set([
  'query',
  'queryText',
  'searchQuery',
  'searchTerm',
  'keyword',
  'text',
])

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object')
    return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function normalizeString(value: unknown, maxLength = MAX_STRING_LENGTH): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const trimmed = value.trim()
  if (!trimmed)
    return undefined
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

export function normalizeNumber(
  value: unknown,
  options: { min?: number, max?: number } = {},
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return undefined
  const min = options.min ?? -Infinity
  const max = options.max ?? Infinity
  if (value < min || value > max)
    return undefined
  return value
}

function sanitizeStringArray(value: unknown, limit = MAX_INPUT_TYPES): string[] | undefined {
  if (!Array.isArray(value))
    return undefined
  const normalized = value
    .map(item => normalizeString(item, MAX_METADATA_STRING_LENGTH))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit)
  return normalized.length ? normalized : undefined
}

function sanitizeProviderTimings(
  value: unknown,
  limit = MAX_PROVIDER_TIMINGS,
): Record<string, number> | undefined {
  if (!isPlainObject(value))
    return undefined
  const entries = Object.entries(value)
    .filter(([key]) => typeof key === 'string' && key.length > 0)
    .slice(0, limit)
  const sanitizedEntries: Array<[string, number]> = []
  for (const [key, raw] of entries) {
    const normalizedKey = normalizeString(key, MAX_METADATA_KEY_LENGTH)
    const duration = normalizeNumber(raw, { min: 0, max: MAX_PROVIDER_DURATION_MS })
    if (!normalizedKey || duration === undefined)
      continue
    sanitizedEntries.push([normalizedKey, Math.round(duration)])
  }
  if (!sanitizedEntries.length)
    return undefined
  return Object.fromEntries(sanitizedEntries)
}

function sanitizeProviderNumberMap(
  value: unknown,
  options: { max?: number, limit?: number } = {},
): Record<string, number> | undefined {
  if (!isPlainObject(value))
    return undefined
  const limit = options.limit ?? MAX_PROVIDER_TIMINGS
  const max = options.max ?? MAX_SEARCH_RESULT_COUNT
  const sanitizedEntries: Array<[string, number]> = []
  for (const [key, raw] of Object.entries(value).slice(0, limit)) {
    const normalizedKey = normalizeString(key, MAX_METADATA_KEY_LENGTH)
    const numberValue = normalizeNumber(raw, { min: 0, max })
    if (!normalizedKey || typeof numberValue !== 'number')
      continue
    sanitizedEntries.push([normalizedKey, Math.round(numberValue)])
  }
  return sanitizedEntries.length ? Object.fromEntries(sanitizedEntries) : undefined
}

function sanitizeProviderStatusMap(value: unknown): Record<string, string> | undefined {
  if (!isPlainObject(value))
    return undefined
  const sanitizedEntries: Array<[string, string]> = []
  for (const [key, raw] of Object.entries(value).slice(0, MAX_PROVIDER_TIMINGS)) {
    const normalizedKey = normalizeString(key, MAX_METADATA_KEY_LENGTH)
    const status = normalizeString(raw, 16)
    if (!normalizedKey || !status || !PROVIDER_STATUS_VALUES.has(status))
      continue
    sanitizedEntries.push([normalizedKey, status])
  }
  return sanitizedEntries.length ? Object.fromEntries(sanitizedEntries) : undefined
}

function sanitizeMetadataValue(value: unknown, depth = 0): unknown {
  if (value == null)
    return value
  if (depth > MAX_METADATA_DEPTH)
    return undefined
  if (typeof value === 'string') {
    return value.length > MAX_METADATA_STRING_LENGTH
      ? value.slice(0, MAX_METADATA_STRING_LENGTH)
      : value
  }
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean')
    return value
  if (Array.isArray(value)) {
    const trimmed = value
      .map(item => sanitizeMetadataValue(item, depth + 1))
      .filter(item => item !== undefined)
      .slice(0, MAX_METADATA_KEYS)
    return trimmed.length ? trimmed : undefined
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .filter(([key]) => typeof key === 'string' && key.length > 0)
      .slice(0, MAX_METADATA_KEYS)
    const sanitizedEntries: Array<[string, unknown]> = []
    for (const [key, raw] of entries) {
      const normalizedKey = normalizeString(key, MAX_METADATA_KEY_LENGTH)
      if (!normalizedKey || REDACTED_METADATA_KEYS.has(normalizedKey))
        continue
      const sanitized = sanitizeMetadataValue(raw, depth + 1)
      if (sanitized !== undefined)
        sanitizedEntries.push([normalizedKey, sanitized])
    }
    return sanitizedEntries.length ? Object.fromEntries(sanitizedEntries) : undefined
  }
  return undefined
}

function sanitizeMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(value))
    return undefined
  const sanitized = sanitizeMetadataValue(value, 0)
  if (!sanitized || !isPlainObject(sanitized))
    return undefined
  try {
    const json = JSON.stringify(sanitized)
    if (json.length > MAX_METADATA_BYTES)
      return undefined
  }
  catch {
    return undefined
  }
  return sanitized
}

function isAllowedEventType(value: unknown): value is TelemetryEvent['eventType'] {
  return typeof value === 'string' && ALLOWED_EVENT_TYPES.has(value)
}

export function normalizeUsageCategoryPart(value: unknown, maxLength = 48): string | undefined {
  const normalized = normalizeString(value, maxLength)
  if (!normalized)
    return undefined

  const cleaned = normalized
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return cleaned || undefined
}

export function resolveAppCategory(bundleId: string): string {
  const fingerprint = bundleId.toLowerCase()

  const rules: Array<{ category: string; keywords: string[] }> = [
    {
      category: 'developer_tools',
      keywords: [
        'code',
        'cursor',
        'codex',
        'warp',
        'iterm',
        'terminal',
        'xcode',
        'android-studio',
        'jetbrains',
        'intellij',
        'webstorm',
        'pycharm',
        'clion',
        'goland',
        'dev.',
        'devtools',
        'docker',
        'postman',
      ],
    },
    {
      category: 'browser',
      keywords: ['chrome', 'safari', 'firefox', 'edge', 'brave', 'arc', 'opera', 'browser'],
    },
    {
      category: 'communication',
      keywords: [
        'wechat',
        'qq',
        'telegram',
        'slack',
        'discord',
        'whatsapp',
        'teams',
        'zoom',
        'feishu',
        'lark',
        'messenger',
      ],
    },
    {
      category: 'productivity',
      keywords: ['notion', 'obsidian', 'todo', 'evernote', 'calendar', 'notes', 'memo', 'notepad'],
    },
    {
      category: 'media',
      keywords: ['music', 'spotify', 'netease', 'qqmusic', 'video', 'vlc', 'iina', 'player', 'podcast'],
    },
    {
      category: 'design',
      keywords: ['figma', 'sketch', 'photoshop', 'illustrator', 'canva', 'premiere', 'finalcut', 'affinity'],
    },
    {
      category: 'system',
      keywords: ['activitymonitor', 'systempreferences', 'system settings', 'finder', 'explorer', 'taskmgr'],
    },
  ]

  for (const rule of rules) {
    if (rule.keywords.some(keyword => fingerprint.includes(keyword))) {
      return rule.category
    }
  }

  return 'others'
}

function resolveFeatureUseCategory(meta: Record<string, unknown>): { level1: string; level2: string } {
  const categoryL1 = normalizeUsageCategoryPart(meta.usageCategoryL1)
  const categoryL2 = normalizeUsageCategoryPart(meta.usageCategoryL2)
  if (categoryL1 && categoryL2) {
    return { level1: categoryL1, level2: categoryL2 }
  }

  const entityType = normalizeUsageCategoryPart(meta.entityType)
  const entityId = normalizeString(meta.entityId, MAX_METADATA_STRING_LENGTH)?.toLowerCase()
  if (entityType === 'app') {
    return {
      level1: 'app',
      level2: resolveAppCategory(entityId || ''),
    }
  }

  if (entityType === 'plugin') {
    return { level1: 'plugin', level2: 'others' }
  }

  const sourceType = normalizeUsageCategoryPart(meta.sourceType)
  if (sourceType) {
    return { level1: sourceType, level2: 'others' }
  }

  return { level1: 'others', level2: 'others' }
}

function sanitizeFeatureUseMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value)
    return undefined

  const metadata: Record<string, unknown> = {}

  const stringFields: Array<[key: string, maxLength?: number]> = [
    ['sessionId', 64],
    ['action', 32],
    ['stage', 32],
    ['result', 32],
    ['sourceType', 64],
    ['sourceId', 128],
    ['sourceName', 128],
    ['sourceVersion', 64],
    ['itemKind', 64],
    ['pluginName', 128],
    ['featureId', 128],
  ]

  for (const [field, maxLength] of stringFields) {
    const normalized = normalizeString(value[field], maxLength)
    if (normalized)
      metadata[field] = normalized
  }

  const executeLatencyMs = normalizeNumber(value.executeLatencyMs, { min: 0, max: MAX_SEARCH_DURATION_MS })
  if (typeof executeLatencyMs === 'number') {
    metadata.executeLatencyMs = executeLatencyMs
  }

  const category = resolveFeatureUseCategory(value)
  metadata.usageCategoryL1 = category.level1
  metadata.usageCategoryL2 = category.level2

  return Object.keys(metadata).length ? metadata : undefined
}

function sanitizeSearchMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value)
    return undefined

  const metadata: Record<string, unknown> = {}

  const stringFields: Array<[key: string, maxLength?: number]> = [
    ['sessionId', 64],
    ['queryType', 32],
    ['searchScene', 48],
    ['providerFilter', 64],
  ]

  for (const [field, maxLength] of stringFields) {
    const normalized = normalizeString(value[field], maxLength)
    if (normalized)
      metadata[field] = normalized
  }

  const booleanFields = ['hasFilters']
  for (const field of booleanFields) {
    if (typeof value[field] === 'boolean')
      metadata[field] = value[field]
  }

  const durationFields = [
    'firstResultMs',
    'totalDurationMs',
    'sortingDuration',
    'usageStatsDuration',
    'completionDuration',
    'parseDuration',
    'providerAggregationDuration',
    'mergeRankDuration',
  ]
  for (const field of durationFields) {
    const normalized = normalizeNumber(value[field], { min: 0, max: MAX_SEARCH_DURATION_MS })
    if (typeof normalized === 'number')
      metadata[field] = Math.round(normalized)
  }

  const countFields = [
    'firstResultCount',
    'queryLength',
    'providerErrorCount',
    'providerTimeoutCount',
  ]
  for (const field of countFields) {
    const normalized = normalizeNumber(value[field], { min: 0, max: MAX_SEARCH_RESULT_COUNT })
    if (typeof normalized === 'number')
      metadata[field] = Math.round(normalized)
  }

  const filterKinds = sanitizeStringArray(value.filterKinds, 20)
  if (filterKinds)
    metadata.filterKinds = filterKinds
  const filterSources = sanitizeStringArray(value.filterSources, 20)
  if (filterSources)
    metadata.filterSources = filterSources

  const providerResults = sanitizeProviderNumberMap(value.providerResults)
  if (providerResults)
    metadata.providerResults = providerResults
  const resultCategories = sanitizeProviderNumberMap(value.resultCategories)
  if (resultCategories)
    metadata.resultCategories = resultCategories
  const providerStatus = sanitizeProviderStatusMap(value.providerStatus)
  if (providerStatus)
    metadata.providerStatus = providerStatus

  return Object.keys(metadata).length ? metadata : undefined
}

export function normalizeTelemetryInput(input: TelemetryEventInput): NormalizedTelemetryResult {
  if (!input || typeof input !== 'object')
    return { telemetry: null, reason: 'invalid_payload' }

  if (!isAllowedEventType(input.eventType))
    return { telemetry: null, reason: 'invalid_event_type' }

  const isAnonymous = input.isAnonymous !== false
  const metadata = sanitizeMetadata(input.metadata)
  const normalizedMetadata = input.eventType === 'feature_use'
    ? sanitizeFeatureUseMetadata(metadata)
    : input.eventType === 'search'
      ? sanitizeSearchMetadata(metadata)
      : metadata

  return {
    telemetry: {
      eventType: input.eventType,
      userId: normalizeString(input.userId),
      clientId: normalizeString(input.clientId),
      deviceFingerprint: normalizeString(input.deviceFingerprint),
      platform: normalizeString(input.platform),
      version: normalizeString(input.version, MAX_METADATA_STRING_LENGTH),
      region: normalizeString(input.region, 8),
      searchQuery: normalizeString(input.searchQuery, MAX_METADATA_STRING_LENGTH),
      searchDurationMs: normalizeNumber(input.searchDurationMs, { min: 0, max: MAX_SEARCH_DURATION_MS }),
      searchResultCount: normalizeNumber(input.searchResultCount, { min: 0, max: MAX_SEARCH_RESULT_COUNT }),
      providerTimings: sanitizeProviderTimings(input.providerTimings),
      inputTypes: sanitizeStringArray(input.inputTypes),
      metadata: normalizedMetadata,
      isAnonymous,
    },
  }
}

export function safeStringify(value: unknown, maxBytes = MAX_QUARANTINE_PAYLOAD_BYTES): string | null {
  try {
    const raw = JSON.stringify(value)
    if (raw.length <= maxBytes)
      return raw
    return raw.slice(0, maxBytes)
  }
  catch {
    return null
  }
}
