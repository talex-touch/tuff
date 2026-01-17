/**
 * Version comparison utilities for plugin market
 *
 * Provides semver-compatible comparison without external dependencies
 */

export interface VersionCompareResult {
  /** -1: installed < market (upgradable), 0: equal, 1: installed > market */
  comparison: -1 | 0 | 1
  /** Whether the market version is newer (upgrade available) */
  hasUpgrade: boolean
  /** Whether the installed version is newer than market */
  isNewer: boolean
  /** Formatted version strings for display */
  installedDisplay: string
  marketDisplay: string
}

/**
 * Parse a semver-like version string into comparable parts
 * Supports: 1.0.0, 1.0.0-beta.1, 1.0.0-alpha, etc.
 */
function parseVersion(version: string): {
  major: number
  minor: number
  patch: number
  prerelease: string[]
} {
  const cleaned = version.replace(/^v/, '').trim()
  const [main, prerelease] = cleaned.split('-')
  const [major = 0, minor = 0, patch = 0] = (main || '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)

  return {
    major,
    minor,
    patch,
    prerelease: prerelease ? prerelease.split('.') : []
  }
}

/**
 * Compare two prerelease arrays
 * Rules:
 * - No prerelease > has prerelease (1.0.0 > 1.0.0-beta)
 * - Compare each identifier: numeric < alpha, then lexically
 */
function comparePrereleases(a: string[], b: string[]): number {
  // No prerelease is higher than any prerelease
  if (a.length === 0 && b.length > 0) return 1
  if (a.length > 0 && b.length === 0) return -1
  if (a.length === 0 && b.length === 0) return 0

  const maxLen = Math.max(a.length, b.length)
  for (let i = 0; i < maxLen; i++) {
    const aPart = a[i]
    const bPart = b[i]

    // Missing part is less
    if (aPart === undefined) return -1
    if (bPart === undefined) return 1

    const aNum = Number.parseInt(aPart, 10)
    const bNum = Number.parseInt(bPart, 10)
    const aIsNum = !isNaN(aNum)
    const bIsNum = !isNaN(bNum)

    // Numeric < string
    if (aIsNum && !bIsNum) return -1
    if (!aIsNum && bIsNum) return 1

    // Both numeric
    if (aIsNum && bIsNum) {
      if (aNum < bNum) return -1
      if (aNum > bNum) return 1
      continue
    }

    // Both string - lexical comparison
    if (aPart < bPart) return -1
    if (aPart > bPart) return 1
  }

  return 0
}

/**
 * Compare two semver-like version strings
 * @returns -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareVersions(a: string | undefined, b: string | undefined): -1 | 0 | 1 {
  // Handle undefined/empty cases
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1

  const aParsed = parseVersion(a)
  const bParsed = parseVersion(b)

  // Compare major.minor.patch
  if (aParsed.major !== bParsed.major) {
    return aParsed.major < bParsed.major ? -1 : 1
  }
  if (aParsed.minor !== bParsed.minor) {
    return aParsed.minor < bParsed.minor ? -1 : 1
  }
  if (aParsed.patch !== bParsed.patch) {
    return aParsed.patch < bParsed.patch ? -1 : 1
  }

  // Compare prerelease
  return comparePrereleases(aParsed.prerelease, bParsed.prerelease) as -1 | 0 | 1
}

/**
 * Check if market version is newer than installed version
 */
export function hasUpgradeAvailable(
  installedVersion: string | undefined,
  marketVersion: string | undefined
): boolean {
  if (!installedVersion || !marketVersion) return false
  return compareVersions(installedVersion, marketVersion) === -1
}

/**
 * Format version for display (ensure 'v' prefix)
 */
export function formatVersion(version: string | undefined): string {
  if (!version) return '—'
  const cleaned = version.replace(/^v/, '').trim()
  return cleaned ? `v${cleaned}` : '—'
}

/**
 * Get complete version comparison result
 */
export function getVersionCompareResult(
  installedVersion: string | undefined,
  marketVersion: string | undefined
): VersionCompareResult {
  const comparison = compareVersions(installedVersion, marketVersion)

  return {
    comparison,
    hasUpgrade: comparison === -1,
    isNewer: comparison === 1,
    installedDisplay: formatVersion(installedVersion),
    marketDisplay: formatVersion(marketVersion)
  }
}

/**
 * Composable for version comparison in market context
 */
export function useVersionCompare() {
  return {
    compareVersions,
    hasUpgradeAvailable,
    formatVersion,
    getVersionCompareResult
  }
}
