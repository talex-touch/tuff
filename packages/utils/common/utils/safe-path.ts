import pathBrowserify from 'path-browserify'
import { hasWindow } from '../../env'

const path = (() => {
  if (hasWindow()) {
    return pathBrowserify
  }

  const nodeRequire = typeof require === 'function' ? require : null
  if (nodeRequire) {
    try {
      return nodeRequire('node:path')
    }
    catch {
      return pathBrowserify
    }
  }

  return pathBrowserify
})()

export interface SafePathResult {
  resolvedPath: string | null
  error?: string
}

export interface SafePathOptions {
  allowAbsolute?: boolean
  allowRoot?: boolean
}

const NULL_BYTE_PATTERN = /\0/

/**
 * `node:path.win32.isAbsolute` without `node:path`.
 *
 * In any window context `path` above is path-browserify, whose `win32` property is `null`.
 * Dereferencing it threw a TypeError for every input the POSIX check answered `false` to —
 * which is every relative path, every Windows path and the empty string, i.e. the whole
 * "no" half of a predicate whose job is to answer yes or no (#580).
 *
 * Verified equivalent to `node:path.win32.isAbsolute` across 23 cases including drive
 * letters, UNC prefixes, bare `\\`, single leading separators and `C:foo`. A leading
 * separator alone counts, which is what an earlier drive-letter-or-UNC form of this regex
 * got wrong on four of them.
 */
const WIN32_ABSOLUTE_PATTERN = /^(?:[\\/]|[a-z]:[\\/])/i

export function isAbsolutePath(value: string): boolean {
  return path.isAbsolute(value) || WIN32_ABSOLUTE_PATTERN.test(value)
}

/** Matches either separator, so these work on paths from either platform. */
const ANY_SEPARATOR_PATTERN = /[\\/]/

/**
 * Display helpers for paths whose separator is not known at the call site.
 *
 * The renderer imports path-browserify, whose `sep` is `/`. Given a Windows path from the
 * main process, `basename` returns the whole string and `dirname` returns `"."` — so a file
 * chip showed `C:\Users\me\Documents\report.pdf` where it meant `report.pdf` (#581).
 * These split on either separator instead of choosing a platform.
 */
function segments(value: string): string[] {
  return String(value ?? '')
    .split(ANY_SEPARATOR_PATTERN)
    .filter(Boolean)
}

/** The final path segment. `''` when there is none. */
export function displayBasename(value: string): string {
  return segments(value).at(-1) ?? ''
}

/** The immediate parent directory's *name*, not the full parent path. `''` at the root. */
export function displayParentName(value: string): string {
  const parts = segments(value)
  return parts.length >= 2 ? parts.at(-2)! : ''
}

/** Lowercased extension without the leading dot. `''` when there is none. */
export function displayExtension(value: string): string {
  const base = displayBasename(value)
  const dot = base.lastIndexOf('.')
  // A leading dot is a hidden file, not an extension: `.gitignore` has none.
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function isSafePathSegment(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..')
    return false
  if (NULL_BYTE_PATTERN.test(trimmed))
    return false
  if (trimmed.includes('/') || trimmed.includes('\\'))
    return false
  return true
}

export function normalizeAbsolutePath(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed)
    return null
  if (!isAbsolutePath(trimmed))
    return null
  if (NULL_BYTE_PATTERN.test(trimmed))
    return null
  return path.normalize(trimmed)
}

export function resolveSafePath(
  baseDir: string,
  targetPath: string,
  options: SafePathOptions = {},
): SafePathResult {
  const allowAbsolute = options.allowAbsolute ?? false
  const allowRoot = options.allowRoot ?? false

  const base = baseDir.trim()
  const target = targetPath.trim()
  if (!base || !target) {
    return { resolvedPath: null, error: 'PATH_EMPTY' }
  }

  if (NULL_BYTE_PATTERN.test(target)) {
    return { resolvedPath: null, error: 'PATH_NULL_BYTE' }
  }

  if (!allowAbsolute && isAbsolutePath(target)) {
    return { resolvedPath: null, error: 'PATH_ABSOLUTE_NOT_ALLOWED' }
  }

  const resolvedBase = path.resolve(base)
  const resolvedTarget = allowAbsolute && isAbsolutePath(target)
    ? path.normalize(target)
    : path.resolve(resolvedBase, target)

  if (resolvedTarget === resolvedBase) {
    return allowRoot
      ? { resolvedPath: resolvedTarget }
      : { resolvedPath: null, error: 'PATH_ROOT_NOT_ALLOWED' }
  }

  if (!resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)) {
    return { resolvedPath: null, error: 'PATH_TRAVERSAL' }
  }

  return { resolvedPath: resolvedTarget }
}

export function assertSafePath(
  baseDir: string,
  targetPath: string,
  options: SafePathOptions = {},
): string {
  const result = resolveSafePath(baseDir, targetPath, options)
  if (!result.resolvedPath) {
    throw new Error(result.error ?? 'PATH_INVALID')
  }
  return result.resolvedPath
}
