import type { MaybePromise, ModuleKey } from '@talex-touch/utils'
import url from 'node:url'
import os from 'node:os'
import process from 'node:process'
import chalk from 'chalk'
import { app, net, session } from 'electron'
import { normalizeAbsolutePath, resolveSafePath } from '@talex-touch/utils/common/utils/safe-path'
import { FILE_SCHEMA } from '../../config/default'
import { BaseModule } from '../abstract-base-module'

/** Deduplicate error logs -- only log each failing path once per session. */
const loggedErrorPaths = new Set<string>()

function buildAllowedRoots(): string[] {
  const platform = process.platform
  const winRoots =
    platform === 'win32'
      ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.SystemRoot]
      : []
  const linuxRoots = platform === 'linux' ? ['/usr/share', '/usr/local/share', '/opt'] : []
  const candidates = [
    app.getPath('home'),
    app.getPath('userData'),
    app.getPath('temp'),
    os.tmpdir(),
    ...winRoots,
    ...linuxRoots,
    '/Applications',
    '/System/Applications',
    '/System/Library/CoreServices'
  ]

  const roots: string[] = []
  for (const candidate of candidates) {
    const normalized = normalizeAbsolutePath(candidate)
    if (normalized && !roots.includes(normalized)) {
      roots.push(normalized)
    }
  }
  return roots
}

function isAllowedTfilePath(filePath: string, roots: string[]): boolean {
  const normalized = normalizeAbsolutePath(filePath)
  if (!normalized) {
    return false
  }

  // macOS (HFS+/APFS) is case-insensitive by default;
  // URLs from Chromium may arrive with lowercased hostnames (e.g. /users/ instead of /Users/)
  if (process.platform === 'darwin') {
    const lower = normalized.toLowerCase()
    return roots.some((root) => {
      const lowerRoot = root.toLowerCase()
      return lower === lowerRoot || lower.startsWith(`${lowerRoot}/`)
    })
  }

  return roots.some(
    (root) =>
      resolveSafePath(root, normalized, {
        allowAbsolute: true,
        allowRoot: true
      }).resolvedPath
  )
}

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
function extractAbsolutePath(rawUrl: string): string {
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

  try {
    const parsed = new URL(rawUrl)
    if (parsed.hostname && /^[a-z]$/i.test(parsed.hostname) && parsed.pathname.startsWith('/')) {
      return normalizeDecodedPath(decodeStable(`${parsed.hostname}:${parsed.pathname}`))
    }
    const merged = parsed.hostname ? `/${parsed.hostname}${parsed.pathname}` : parsed.pathname
    return normalizeDecodedPath(decodeStable(merged))
  } catch {
    const prefix = `${FILE_SCHEMA}://`
    const rawWithTail = rawUrl.startsWith(prefix) ? rawUrl.slice(prefix.length) : rawUrl
    const tailIndex = rawWithTail.search(/[?#]/)
    const body = tailIndex >= 0 ? rawWithTail.slice(0, tailIndex) : rawWithTail
    return normalizeDecodedPath(decodeStable(body))
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
    const allowedRoots = buildAllowedRoots()

    ses.protocol.handle(FILE_SCHEMA, async (request) => {
      const filePath = extractAbsolutePath(request.url)
      const normalizedPath = normalizeAbsolutePath(filePath)
      if (!normalizedPath || !isAllowedTfilePath(normalizedPath, allowedRoots)) {
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
