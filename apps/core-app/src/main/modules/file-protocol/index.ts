import type { MaybePromise, ModuleKey } from '@talex-touch/utils'
import url from 'node:url'
import { net, session } from 'electron'
import { normalizeAbsolutePath } from '@talex-touch/utils/common/utils/safe-path'
import { FILE_SCHEMA } from '../../config/default'
import {
  getAllowedLocalFileRoots,
  isAllowedLocalFilePath,
  normalizeDarwinUsersPath
} from '../../utils/local-file-policy'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'

/** Deduplicate error logs -- only log each failing path once per session. */
const loggedErrorPaths = new Set<string>()
const fileProtocolLog = createLogger('FileProtocolModule')

/**
 * Extract an absolute file path from a canonical `tfile:///absolute/path` URL.
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
    if (!body.startsWith('/')) {
      return null
    }
    return normalizeDecodedPath(decodeStable(body))
  }

  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== `${FILE_SCHEMA}:`) {
      return null
    }
    if (parsed.hostname) {
      return null
    }
    return normalizeDecodedPath(decodeStable(parsed.pathname))
  } catch {
    return null
  }
}

export const __test__ = {
  extractAbsolutePath
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
        if (!loggedErrorPaths.has(filePath)) {
          loggedErrorPaths.add(filePath)
          fileProtocolLog.warn(`Blocked path: ${filePath}`)
        }
        return new Response('Forbidden', { status: 403 })
      }

      const fileUrl = url.pathToFileURL(normalizedPath).toString()

      try {
        return await net.fetch(fileUrl)
      } catch (error) {
        if (!loggedErrorPaths.has(normalizedPath)) {
          loggedErrorPaths.add(normalizedPath)
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

    fileProtocolLog.info('tfile protocol registered')
  }

  onDestroy(): MaybePromise<void> {
    session.defaultSession.protocol.unhandle(FILE_SCHEMA)
  }
}

const fileProtocolModule = new FileProtocolModule()

export { fileProtocolModule }
