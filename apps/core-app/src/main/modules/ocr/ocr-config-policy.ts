export interface OcrConfigPersistOptions {
  minIntervalMs?: number
  skipWhenQueueDepthAtLeast?: number
  droppable?: boolean
  skipIfUnchanged?: boolean
}

export const OCR_START_WRITE_SKIP_QUEUE_DEPTH = 8
const OCR_LAST_QUEUED_MIN_PERSIST_INTERVAL_MS = 30 * 1000
const OCR_LAST_DISPATCH_MIN_PERSIST_INTERVAL_MS = 30 * 1000
const OCR_LAST_SUCCESS_MIN_PERSIST_INTERVAL_MS = 30 * 1000

const OCR_CONFIG_PERSIST_OPTIONS: Record<string, OcrConfigPersistOptions> = {
  'ocr:last-queued': {
    minIntervalMs: OCR_LAST_QUEUED_MIN_PERSIST_INTERVAL_MS,
    skipWhenQueueDepthAtLeast: OCR_START_WRITE_SKIP_QUEUE_DEPTH,
    droppable: true
  },
  'ocr:last-dispatch': {
    minIntervalMs: OCR_LAST_DISPATCH_MIN_PERSIST_INTERVAL_MS,
    skipWhenQueueDepthAtLeast: OCR_START_WRITE_SKIP_QUEUE_DEPTH,
    droppable: true
  },
  'ocr:last-success': {
    minIntervalMs: OCR_LAST_SUCCESS_MIN_PERSIST_INTERVAL_MS,
    skipWhenQueueDepthAtLeast: OCR_START_WRITE_SKIP_QUEUE_DEPTH,
    droppable: true
  },
  'ocr:queue-disabled': {
    skipIfUnchanged: true
  }
}

const OCR_CONFIG_WRITE_LABELS: Record<string, string> = {
  'ocr:last-queued': 'ocr.config.last-queued',
  'ocr:last-dispatch': 'ocr.config.last-dispatch',
  'ocr:last-success': 'ocr.config.last-success',
  'ocr:last-failure': 'ocr.config.last-failure',
  'ocr:queue-disabled': 'ocr.config.queue-disabled'
}

export function resolveOcrConfigPersistOptions(
  key: string,
  overrides?: OcrConfigPersistOptions
): OcrConfigPersistOptions | undefined {
  const defaults = OCR_CONFIG_PERSIST_OPTIONS[key]
  if (!defaults && !overrides) {
    return undefined
  }
  return { ...(defaults ?? {}), ...(overrides ?? {}) }
}

export function getOcrConfigWriteLabel(key: string): string {
  const knownLabel = OCR_CONFIG_WRITE_LABELS[key]
  if (knownLabel) {
    return knownLabel
  }

  const normalizedKey = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalizedKey ? `ocr.config.${normalizedKey}` : 'ocr.config.unknown'
}

export function shouldSkipOcrConfigPersist(
  options: OcrConfigPersistOptions | undefined,
  context: {
    queued: number
    lastPersistAt?: number
    now?: number
  }
): boolean {
  if (!options) return false

  if (
    typeof options.skipWhenQueueDepthAtLeast === 'number' &&
    context.queued >= options.skipWhenQueueDepthAtLeast
  ) {
    return true
  }

  if (typeof options.minIntervalMs === 'number' && options.minIntervalMs > 0) {
    const now = context.now ?? Date.now()
    const lastPersistAt = context.lastPersistAt ?? 0
    if (now - lastPersistAt < options.minIntervalMs) {
      return true
    }
  }

  return false
}

export function computeOcrConfigPersistSignature(key: string, value: unknown): string {
  if (key !== 'ocr:queue-disabled' || !value || typeof value !== 'object') {
    return JSON.stringify(value ?? null)
  }

  const record = value as Record<string, unknown>
  if (record.disabled === true) {
    return JSON.stringify({
      disabled: true,
      reason: record.reason ?? null,
      disabledUntil: record.disabledUntil ?? null,
      strike: record.strike ?? null
    })
  }

  if (record.disabled === false) {
    return JSON.stringify({
      disabled: false,
      trigger: record.trigger ?? null
    })
  }

  return JSON.stringify(record)
}
