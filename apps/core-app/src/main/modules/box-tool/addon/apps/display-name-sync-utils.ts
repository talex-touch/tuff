import type { AppDisplayNameQuality } from './app-types'

export function normalizeDisplayName(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function isReplacementLikeChar(char: string): boolean {
  const codePoint = char.codePointAt(0)
  if (codePoint === undefined) return false

  return (
    codePoint === 0xfffd ||
    codePoint === 0x25a0 ||
    codePoint === 0x25a1 ||
    codePoint === 0x25a2 ||
    (codePoint >= 0xe000 && codePoint <= 0xf8ff)
  )
}

export function isProbablyCorruptedDisplayName(value: string | null | undefined): boolean {
  const normalized = normalizeDisplayName(value)
  if (!normalized) return false

  const chars = Array.from(normalized)
  const suspiciousCount = chars.filter(isReplacementLikeChar).length
  if (suspiciousCount === 0) return false

  return (
    chars.some((char) => char === '\uFFFD') ||
    suspiciousCount >= Math.max(1, Math.ceil(chars.length / 3))
  )
}

export function resolveDisplayName(
  displayName: string | null | undefined,
  fallbackName: string | null | undefined
): string {
  const normalizedDisplayName = normalizeDisplayName(displayName)
  if (normalizedDisplayName && !isProbablyCorruptedDisplayName(normalizedDisplayName)) {
    return normalizedDisplayName
  }

  const normalizedFallbackName = normalizeDisplayName(fallbackName)
  return normalizedFallbackName || normalizedDisplayName
}

export function shouldUpdateDisplayName(
  currentDisplayName: string | null | undefined,
  incomingDisplayName: string | null | undefined,
  options?: {
    currentQuality?: AppDisplayNameQuality | null
    incomingQuality?: AppDisplayNameQuality | null
  }
): boolean {
  const normalizedIncoming = normalizeDisplayName(incomingDisplayName)
  if (!normalizedIncoming) return false
  if (isProbablyCorruptedDisplayName(normalizedIncoming)) return false

  const normalizedCurrent = normalizeDisplayName(currentDisplayName)
  if (!normalizedCurrent) return true
  if (isProbablyCorruptedDisplayName(normalizedCurrent)) return true

  const currentQualityRank = resolveDisplayNameQualityRank(options?.currentQuality)
  const incomingQualityRank = resolveDisplayNameQualityRank(options?.incomingQuality)
  if (currentQualityRank !== null && incomingQualityRank !== null) {
    if (incomingQualityRank < currentQualityRank) return false
    if (incomingQualityRank > currentQualityRank) {
      return normalizedIncoming !== normalizedCurrent
    }
  } else if (shouldUpgradeDisplayNameQuality(options?.currentQuality, options?.incomingQuality)) {
    return normalizedIncoming !== normalizedCurrent
  }

  return normalizedIncoming !== normalizedCurrent
}

const DISPLAY_NAME_QUALITY_RANK: Record<AppDisplayNameQuality, number> = {
  fallback: 0,
  filename: 1,
  registry: 2,
  manifest: 3,
  localized: 4,
  system: 5
}

export function shouldUpgradeDisplayNameQuality(
  currentQuality: AppDisplayNameQuality | null | undefined,
  incomingQuality: AppDisplayNameQuality | null | undefined
): boolean {
  if (!incomingQuality) return false
  const currentRank = resolveDisplayNameQualityRank(currentQuality) ?? -1
  const incomingRank = resolveDisplayNameQualityRank(incomingQuality)
  if (incomingRank === null) return false
  return incomingRank > currentRank
}

function resolveDisplayNameQualityRank(
  quality: AppDisplayNameQuality | null | undefined
): number | null {
  return quality ? DISPLAY_NAME_QUALITY_RANK[quality] : null
}
