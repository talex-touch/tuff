/**
 * App identity matching for context scoring.
 *
 * Candidate item ids are not uniformly bundle ids: the app provider keys
 * managed/scanned entries by absolute path (`/Applications/Visual Studio
 * Code.app`), so a bundle-id-only `includes()` check silently scored every
 * path-form candidate as "no match". Matching therefore runs over both the raw
 * identifier and, for path-form ids, the app's display name taken from the
 * basename.
 */

export interface AppMatchRule {
  /** Bundle-id fragments, matched case-insensitively against the raw id. */
  bundleIds: readonly string[]
  /** Display-name fragments, matched against the basename of a path-form id. */
  names?: readonly string[]
}

/** `/Applications/Visual Studio Code.app` → `visual studio code` */
export function extractAppNameFromPath(identifier: string): string | null {
  if (!identifier.includes('/') && !identifier.includes('\\')) return null

  const basename = identifier.split(/[\\/]/).filter(Boolean).pop()
  if (!basename) return null

  return basename.replace(/\.(app|exe|lnk|desktop)$/i, '').toLowerCase()
}

export function matchesAppRule(identifier: string, rule: AppMatchRule): boolean {
  if (!identifier) return false
  const lowered = identifier.toLowerCase()

  if (rule.bundleIds.some((bundleId) => lowered.includes(bundleId.toLowerCase()))) {
    return true
  }

  if (!rule.names?.length) return false
  const name = extractAppNameFromPath(identifier)
  if (!name) return false

  return rule.names.some((candidate) => name.includes(candidate.toLowerCase()))
}

/**
 * Whether a candidate id denotes the same app as the foreground snapshot.
 * Bundle ids compare directly; a path-form candidate compares its basename
 * against the foreground app's display name.
 */
export function isSameAppIdentity(
  identifier: string,
  foregroundApp: { bundleId: string; name?: string }
): boolean {
  if (!identifier || !foregroundApp.bundleId) return false
  if (identifier.toLowerCase().includes(foregroundApp.bundleId.toLowerCase())) return true

  const name = extractAppNameFromPath(identifier)
  const foregroundName = foregroundApp.name?.trim().toLowerCase()
  if (!name || !foregroundName) return false

  return name === foregroundName
}
