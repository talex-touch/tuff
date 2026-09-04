import path from 'node:path'

/**
 * Which freshly created files may occupy a recommendation slot.
 *
 * Deliberately an exclusion list, not an allowlist. A whitelist of "interesting" extensions is
 * wrong in the direction that hurts: it silently drops whatever the user actually works in. The
 * failure mode of an exclusion list is one boring card, which the ranking then buries anyway.
 *
 * Directory scope is NOT decided here. The user already curated it — the file index only walks
 * roots they granted (`indexingRootPolicy.resolveFileSearchRoots` keeps only
 * `permissionState === 'granted'`), so a second directory policy would be a second source of
 * truth for the same question.
 */

/** Path segments that mean "machine output", wherever they appear. */
const EXCLUDED_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  'node_modules',
  'bower_components',
  'vendor',
  'pods',
  '__pycache__',
  'site-packages',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  'caches',
  'cache',
  'logs',
  'tmp',
  'temp',
  'trash',
  '.trash'
])

/** Extensions that are byproducts, transfers in progress, or editor bookkeeping. */
const EXCLUDED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.log',
  '.tmp',
  '.temp',
  '.swp',
  '.swo',
  '.bak',
  '.old',
  '.lock',
  '.pid',
  '.part',
  '.partial',
  '.crdownload',
  '.download',
  '.aria2',
  '.!ut',
  '.map',
  '.pyc',
  '.pyo',
  '.class',
  '.o',
  '.obj',
  '.d',
  '.dSYM'
])

/** Exact names that are never worth surfacing even though their extension looks fine. */
const EXCLUDED_BASENAMES: ReadonlySet<string> = new Set([
  '.ds_store',
  'thumbs.db',
  'desktop.ini',
  'icon\r',
  '.localized'
])

export interface RecommendableFileInput {
  path: string
  size?: number | null
  isDir?: boolean | null
}

/**
 * `true` when this file is worth offering as "you just made this".
 *
 * Freshness is the caller's gate (`files.ctime` inside the novelty window); this only answers
 * whether the *kind* of file deserves a slot.
 */
export function isRecommendableNewFile(file: RecommendableFileInput): boolean {
  if (file.isDir) return false

  const filePath = typeof file.path === 'string' ? file.path.trim() : ''
  if (!filePath) return false

  // A zero-byte file is usually a placeholder a tool just touched, not something the user made.
  // `null`/`undefined` means the scanner did not record a size, which is not evidence either way.
  if (typeof file.size === 'number' && file.size <= 0) return false

  const normalized = filePath.replace(/\\/g, '/')
  const basename = path.posix.basename(normalized).toLowerCase()
  if (!basename || EXCLUDED_BASENAMES.has(basename)) return false

  // Dotfiles are configuration and editor state; the user did not "create a document" by saving
  // one. This also covers `.env`, `.gitignore`, and the whole dot-directory tree below.
  if (basename.startsWith('.')) return false

  const extension = path.posix.extname(basename).toLowerCase()
  if (!extension) return false
  if (EXCLUDED_EXTENSIONS.has(extension)) return false

  const segments = normalized.split('/').slice(0, -1)
  for (const segment of segments) {
    const lower = segment.toLowerCase()
    if (!lower) continue
    // A dot-directory anywhere means everything under it is tooling state (.git, .venv, .cache).
    if (lower.startsWith('.')) return false
    if (EXCLUDED_PATH_SEGMENTS.has(lower)) return false
  }

  return true
}
