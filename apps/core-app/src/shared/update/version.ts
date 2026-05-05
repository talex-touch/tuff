import type { GitHubRelease } from '@talex-touch/utils'
import { resolveUpdateChannelLabel, splitUpdateTag } from '@talex-touch/utils'
import type { AppPreviewChannel } from '@talex-touch/utils'
import { normalizeSupportedUpdateChannel } from './channel'

const PREVIEW_LABELS = new Set(['alpha', 'beta', 'snapshot'])

type ComparableIdentifier = number | string

export interface ComparableUpdateVersion {
  channel: AppPreviewChannel
  major: number
  minor: number
  patch: number
  raw: string
  prereleaseFamily: string | null
  prereleaseIdentifiers: ComparableIdentifier[]
}

function normalizePrereleaseFamily(channelLabel?: string): string | null {
  if (!channelLabel) {
    return null
  }

  const [family = ''] = channelLabel.split('.')
  const normalized = family.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (PREVIEW_LABELS.has(normalized)) {
    return 'preview'
  }

  return normalized
}

function parsePrereleaseIdentifiers(channelLabel?: string): ComparableIdentifier[] {
  if (!channelLabel) {
    return []
  }

  const parts = channelLabel
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length <= 1) {
    return []
  }

  return parts.slice(1).map((part) => {
    const parsed = Number.parseInt(part, 10)
    if (!Number.isNaN(parsed) && `${parsed}` === part) {
      return parsed
    }
    return part.toLowerCase()
  })
}

function compareComparableIdentifiers(
  a: ComparableIdentifier[],
  b: ComparableIdentifier[]
): -1 | 0 | 1 {
  const maxLen = Math.max(a.length, b.length)
  for (let index = 0; index < maxLen; index += 1) {
    const aPart = a[index]
    const bPart = b[index]

    if (aPart === undefined) return -1
    if (bPart === undefined) return 1

    if (typeof aPart === 'number' && typeof bPart === 'string') return -1
    if (typeof aPart === 'string' && typeof bPart === 'number') return 1

    if (aPart < bPart) return -1
    if (aPart > bPart) return 1
  }

  return 0
}

function comparePrerelease(a: ComparableUpdateVersion, b: ComparableUpdateVersion): -1 | 0 | 1 {
  if (!a.prereleaseFamily && b.prereleaseFamily) return 1
  if (a.prereleaseFamily && !b.prereleaseFamily) return -1
  if (!a.prereleaseFamily && !b.prereleaseFamily) return 0

  if (a.prereleaseFamily !== b.prereleaseFamily) {
    return a.prereleaseFamily! < b.prereleaseFamily! ? -1 : 1
  }

  return compareComparableIdentifiers(a.prereleaseIdentifiers, b.prereleaseIdentifiers)
}

export function parseComparableUpdateVersion(versionStr: string): ComparableUpdateVersion {
  const raw = versionStr.trim()
  const { version, channelLabel } = splitUpdateTag(raw)
  const [major = 0, minor = 0, patch = 0] = (version || '')
    .split('.')
    .map((value) => Number.parseInt(value, 10) || 0)

  return {
    channel: normalizeSupportedUpdateChannel(resolveUpdateChannelLabel(channelLabel)),
    major,
    minor,
    patch,
    raw,
    prereleaseFamily: normalizePrereleaseFamily(channelLabel),
    prereleaseIdentifiers: parsePrereleaseIdentifiers(channelLabel)
  }
}

export function compareUpdateVersions(a: string | undefined, b: string | undefined): -1 | 0 | 1 {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1

  const parsedA = parseComparableUpdateVersion(a)
  const parsedB = parseComparableUpdateVersion(b)

  if (parsedA.major !== parsedB.major) {
    return parsedA.major < parsedB.major ? -1 : 1
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor < parsedB.minor ? -1 : 1
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch < parsedB.patch ? -1 : 1
  }

  return comparePrerelease(parsedA, parsedB)
}

export function selectLatestUpdateRelease(releases: GitHubRelease[]): GitHubRelease | null {
  if (!Array.isArray(releases) || releases.length === 0) {
    return null
  }

  return releases.reduce<GitHubRelease | null>((latest, current) => {
    if (!latest) {
      return current
    }

    const comparison = compareUpdateVersions(current.tag_name, latest.tag_name)
    if (comparison === 1) {
      return current
    }
    if (comparison === -1) {
      return latest
    }

    const currentPublishedAt = Date.parse(current.published_at || '')
    const latestPublishedAt = Date.parse(latest.published_at || '')
    if (
      Number.isFinite(currentPublishedAt) &&
      (!Number.isFinite(latestPublishedAt) || currentPublishedAt > latestPublishedAt)
    ) {
      return current
    }

    return latest
  }, null)
}
