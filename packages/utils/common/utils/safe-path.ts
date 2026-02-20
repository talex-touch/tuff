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
    } catch {
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

export function isAbsolutePath(value: string): boolean {
  return path.isAbsolute(value) || path.win32.isAbsolute(value)
}

export function isSafePathSegment(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..') return false
  if (NULL_BYTE_PATTERN.test(trimmed)) return false
  if (trimmed.includes('/') || trimmed.includes('\\')) return false
  return true
}

export function normalizeAbsolutePath(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!isAbsolutePath(trimmed)) return null
  if (NULL_BYTE_PATTERN.test(trimmed)) return null
  return path.normalize(trimmed)
}

export function resolveSafePath(
  baseDir: string,
  targetPath: string,
  options: SafePathOptions = {}
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
  options: SafePathOptions = {}
): string {
  const result = resolveSafePath(baseDir, targetPath, options)
  if (!result.resolvedPath) {
    throw new Error(result.error ?? 'PATH_INVALID')
  }
  return result.resolvedPath
}
