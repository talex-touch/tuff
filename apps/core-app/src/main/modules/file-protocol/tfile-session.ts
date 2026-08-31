import url from 'node:url'
import { normalizeAbsolutePath } from '@talex-touch/utils/common/utils/safe-path'
import { net } from 'electron'
import { FILE_SCHEMA } from '../../config/default'
import {
  getAllowedLocalFileRoots,
  isAllowedLocalFilePath,
  normalizeDarwinUsersPath
} from '../../utils/local-file-policy'
import { createLogger } from '../../utils/logger'

/**
 * Deduplicate error logs -- only log each failing path once, up to a bound.
 *
 * Bounded because the inputs are not: a view rendering thumbnails over a churning result set --
 * clipboard history whose temp files have been deleted, or a plugin emitting unique tfile URLs --
 * contributes one retained string per distinct missing path, for the lifetime of a launcher
 * process that is expected to run for days (#647).
 *
 * Insertion-ordered eviction rather than a true LRU: this only decides whether a warning repeats,
 * so the cheapest bound that keeps recent paths quiet is the right one.
 */
const LOGGED_ERROR_PATH_LIMIT = 512
const loggedErrorPaths = new Set<string>()

/** Records a path and reports whether it is newly seen, evicting the oldest entry past the cap. */
function shouldLogPathOnce(filePath: string): boolean {
  if (loggedErrorPaths.has(filePath)) return false

  if (loggedErrorPaths.size >= LOGGED_ERROR_PATH_LIMIT) {
    const oldest = loggedErrorPaths.values().next().value
    if (oldest !== undefined) loggedErrorPaths.delete(oldest)
  }

  loggedErrorPaths.add(filePath)
  return true
}
const fileProtocolLog = createLogger('FileProtocolModule')

/**
 * Extract an absolute file path from a `tfile` URL.
 *
 * Electron may hand custom standard-scheme requests back as host-style URLs
 * such as `tfile://users/name/file.png` even when renderer code originally
 * assigned `tfile:///Users/name/file.png`. We normalize both shapes here and
 * keep the actual file access guarded by the local file allowlist below.
 */
function extractAbsolutePath(rawUrl: string): string | null {
  const normalizeDecodedPath = (value: string): string => {
    const normalized = value.replace(/\\/g, '/')
    if (/^\/[a-z]:\//i.test(normalized)) {
      return normalized.slice(1)
    }
    if (/^[a-z]:\//i.test(normalized)) {
      return normalized
    }
    return normalized.startsWith('/') ? normalized : `/${normalized}`
  }

  const decodeStable = (value: string): string => {
    let decoded = value
    for (let i = 0; i < 3; i++) {
      try {
        const next = decodeURIComponent(decoded)
        if (next === decoded) break
        decoded = next
      } catch {
        break
      }
    }
    return decoded
  }

  const prefix = `${FILE_SCHEMA}://`
  if (rawUrl.startsWith(prefix)) {
    const rawWithTail = rawUrl.slice(prefix.length)
    const tailIndex = rawWithTail.search(/[?#]/)
    const body = tailIndex >= 0 ? rawWithTail.slice(0, tailIndex) : rawWithTail
    if (!body) {
      return null
    }
    return normalizeDecodedPath(decodeStable(body))
  }

  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== `${FILE_SCHEMA}:`) {
      return null
    }
    const merged = parsed.hostname
      ? /^[a-z]$/i.test(parsed.hostname) && parsed.pathname.startsWith('/')
        ? `${parsed.hostname}:${parsed.pathname}`
        : `/${parsed.hostname}${parsed.pathname}`
      : parsed.pathname
    return normalizeDecodedPath(decodeStable(merged))
  } catch {
    return null
  }
}

export const __test__ = {
  shouldLogPathOnce,
  loggedErrorPaths,
  LOGGED_ERROR_PATH_LIMIT,
  extractAbsolutePath
}

export function clearTfileProtocolLogState(): void {
  loggedErrorPaths.clear()
}

let configuredAdditionalAllowedRoots: string[] = []

export function configureTfileProtocolAdditionalAllowedRoots(roots: string[]): () => void {
  const configuredRoots = roots.filter((root) => typeof root === 'string' && root.length > 0)
  configuredAdditionalAllowedRoots = configuredRoots

  return () => {
    if (configuredAdditionalAllowedRoots === configuredRoots) {
      configuredAdditionalAllowedRoots = []
    }
  }
}

export function registerTfileProtocolForSession(
  targetSession: Electron.Session,
  additionalAllowedRoots: string[] = []
): () => void {
  const allowedRoots = [
    ...getAllowedLocalFileRoots(),
    ...configuredAdditionalAllowedRoots,
    ...additionalAllowedRoots
  ]
  targetSession.protocol.handle(FILE_SCHEMA, async (request) => {
    const extractedPath = extractAbsolutePath(request.url)
    if (!extractedPath) {
      fileProtocolLog.warn('Rejected non-canonical tfile URL', {
        meta: {
          requestUrl: request.url
        }
      })
      return new Response('Bad Request', { status: 400 })
    }
    const filePath = normalizeDarwinUsersPath(extractedPath)
    const normalizedPath = normalizeAbsolutePath(filePath)
    if (!normalizedPath || !isAllowedLocalFilePath(normalizedPath, allowedRoots)) {
      if (shouldLogPathOnce(filePath)) {
        fileProtocolLog.warn(`Blocked path: ${filePath}`)
      }
      return new Response('Forbidden', { status: 403 })
    }

    const fileUrl = url.pathToFileURL(normalizedPath).toString()

    try {
      return await net.fetch(fileUrl, { bypassCustomProtocolHandlers: true })
    } catch (error) {
      if (shouldLogPathOnce(normalizedPath)) {
        fileProtocolLog.error('tfile request error', {
          meta: {
            filePath: normalizedPath,
            fileUrl,
            url: request.url
          },
          error: error instanceof Error ? error.message : String(error)
        })
      }
      return new Response('File not found', { status: 404 })
    }
  })

  let released = false
  return () => {
    if (released) return
    released = true
    targetSession.protocol.unhandle(FILE_SCHEMA)
  }
}
