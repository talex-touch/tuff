import type { MaybePromise, ModuleKey } from '@talex-touch/utils'
import url from 'node:url'
import chalk from 'chalk'
import { net, session } from 'electron'
import { normalizeAbsolutePath } from '@talex-touch/utils/common/utils/safe-path'
import { FILE_SCHEMA } from '../../config/default'
import {
  getAllowedLocalFileRoots,
  isAllowedLocalFilePath,
  normalizeDarwinUsersPath
} from '../../utils/local-file-policy'
import { BaseModule } from '../abstract-base-module'

/** Deduplicate error logs -- only log each failing path once per session. */
const loggedErrorPaths = new Set<string>()
const loggedCompatPaths = new Set<string>()

/**
 * Extract an absolute file path from a tfile:// URL.
 *
 * Handles both `tfile:///absolute/path` (3 slashes, correct) and the legacy
 * `tfile://relative/path` (2 slashes, path accidentally used as hostname)
 * by always ensuring the result starts with `/`.
 *
 * Robust against double-encoding: if the URL was percent-encoded by the
 * renderer's `buildTfileUrl()`, Chromium may or may not re-encode it before
 * delivering it to the protocol handler. We decode until the result stabilises.
 */
function extractAbsolutePath(rawUrl: string): { path: string; usedCompatPath: boolean } {
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
    return {
      path: normalizeDecodedPath(decodeStable(body)),
      usedCompatPath: !body.startsWith('/')
    }
  }

  try {
    const parsed = new URL(rawUrl)
    if (parsed.hostname && /^[a-z]$/i.test(parsed.hostname) && parsed.pathname.startsWith('/')) {
      return {
        path: normalizeDecodedPath(decodeStable(`${parsed.hostname}:${parsed.pathname}`)),
        usedCompatPath: false
      }
    }
    const merged = parsed.hostname ? `/${parsed.hostname}${parsed.pathname}` : parsed.pathname
    return {
      path: normalizeDecodedPath(decodeStable(merged)),
      usedCompatPath: false
    }
  } catch {
    const tailIndex = rawUrl.search(/[?#]/)
    const body = tailIndex >= 0 ? rawUrl.slice(0, tailIndex) : rawUrl
    return {
      path: normalizeDecodedPath(decodeStable(body)),
      usedCompatPath: false
    }
  }
}

class FileProtocolModule extends BaseModule {
  static key: symbol = Symbol.for('FileProtocolModule')
  name: ModuleKey = FileProtocolModule.key

  constructor() {
    super(FileProtocolModule.key, {
      create: false
    })
  }

  onInit(): MaybePromise<void> {
    const ses = session.defaultSession
    const allowedRoots = getAllowedLocalFileRoots()

    ses.protocol.handle(FILE_SCHEMA, async (request) => {
      const { path: extractedPath, usedCompatPath } = extractAbsolutePath(request.url)
      const filePath = normalizeDarwinUsersPath(extractedPath)
      const normalizedPath = normalizeAbsolutePath(filePath)
      if (usedCompatPath && normalizedPath && !loggedCompatPaths.has(normalizedPath)) {
        loggedCompatPaths.add(normalizedPath)
        console.info(chalk.blue('[FileProtocolModule] Compat read hit: normalized legacy tfile URL'), {
          requestUrl: request.url,
          normalizedPath
        })
      }
      if (!normalizedPath || !isAllowedLocalFilePath(normalizedPath, allowedRoots)) {
        if (!loggedErrorPaths.has(filePath)) {
          loggedErrorPaths.add(filePath)
          console.warn(chalk.yellow(`[FileProtocolModule] Blocked path: ${filePath}`))
        }
        return new Response('Forbidden', { status: 403 })
      }

      const fileUrl = url.pathToFileURL(normalizedPath).toString()

      try {
        return await net.fetch(fileUrl)
      } catch (error) {
        if (!loggedErrorPaths.has(normalizedPath)) {
          loggedErrorPaths.add(normalizedPath)
          console.error(chalk.red('[FileProtocolModule] tfile request error:'), {
            filePath: normalizedPath,
            fileUrl,
            url: request.url,
            error: error instanceof Error ? error.message : String(error)
          })
        }
        return new Response('File not found', { status: 404 })
      }
    })

    console.log(chalk.green('[FileProtocolModule] tfile protocol registered'))
  }

  onDestroy(): MaybePromise<void> {
    session.defaultSession.protocol.unhandle(FILE_SCHEMA)
  }
}

const fileProtocolModule = new FileProtocolModule()

export { fileProtocolModule }
