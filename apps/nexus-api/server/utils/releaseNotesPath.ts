const RELEASE_NOTES_SLUG_PREFIX = 'update_'

function normalizeVersionToken(version: string): string {
  return version
    .trim()
    .toLowerCase()
    .replace(/^v/, '')
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildReleaseNotesSlug(version: string): string {
  const normalized = normalizeVersionToken(version)
  const resolved = normalized || 'unknown'
  return `${RELEASE_NOTES_SLUG_PREFIX}${resolved}`
}

export function buildReleaseNotesPath(version: string): string {
  return `/notes/${buildReleaseNotesSlug(version)}`
}

export function isReleaseNotesSlug(slug: string): boolean {
  return typeof slug === 'string' && slug.trim().toLowerCase().startsWith(RELEASE_NOTES_SLUG_PREFIX)
}
