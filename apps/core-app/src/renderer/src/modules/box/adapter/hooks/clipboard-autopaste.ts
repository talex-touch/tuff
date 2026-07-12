import type { IClipboardItem, IClipboardOptions } from './types'

export interface AutoPasteSetting {
  enable: boolean
  time: number
}

export function normalizeClipboardTimestamp(value?: string | number | Date | null): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : null
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function resolveClipboardFreshnessBase(item: IClipboardItem): number | null {
  if (typeof item.freshnessBaseAt === 'number' && Number.isFinite(item.freshnessBaseAt)) {
    return item.freshnessBaseAt
  }
  return typeof item.observedAt === 'number' && Number.isFinite(item.observedAt)
    ? item.observedAt
    : null
}

export function isClipboardFreshForAutoPaste(
  item: IClipboardItem | null | undefined,
  setting: AutoPasteSetting,
  now = Date.now()
): boolean {
  if (!item?.timestamp || !setting.enable || setting.time === -1) return false
  if (item.autoPasteEligible !== true) return false

  const freshnessBase = resolveClipboardFreshnessBase(item)
  if (freshnessBase === null) return false

  const limitMs = setting.time === 0 ? Number.POSITIVE_INFINITY : setting.time * 1000
  return now - freshnessBase <= limitMs
}

export function isSameClipboardItem(
  previous: IClipboardItem | null | undefined,
  next: IClipboardItem | null | undefined
): boolean {
  if (!previous || !next) return false
  if (typeof previous.id === 'number' && typeof next.id === 'number') {
    return previous.id === next.id
  }

  const previousTimestamp = normalizeClipboardTimestamp(previous.timestamp)
  const nextTimestamp = normalizeClipboardTimestamp(next.timestamp)
  return previousTimestamp !== null && nextTimestamp !== null && previousTimestamp === nextTimestamp
}

export function clearImplicitClipboardState(options: IClipboardOptions): boolean {
  if (options.activeClipboardSource === 'manual') return false

  options.last = null
  options.pendingAutoFillItem = null
  options.detectedAt = null
  options.activeClipboardSource = null
  if (options.lastTextAttachmentSource !== 'manual') {
    options.lastTextAttachmentIdentity = null
    options.lastTextAttachmentSource = null
  }
  return true
}
