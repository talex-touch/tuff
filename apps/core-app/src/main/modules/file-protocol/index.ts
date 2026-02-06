import type { MaybePromise, ModuleKey } from '@talex-touch/utils'
import url from 'node:url'
import fsSync from 'node:fs'
import chalk from 'chalk'
import { net, session } from 'electron'
import { FILE_SCHEMA } from '../../config/default'
import { BaseModule } from '../abstract-base-module'

/** Deduplicate error logs -- only log each failing path once per session. */
const loggedErrorPaths = new Set<string>()

/**
 * Extract an absolute file path from a tfile:// URL.
 *
 * Handles both `tfile:///absolute/path` (3 slashes, correct) and the legacy
 * `tfile://relative/path` (2 slashes, path accidentally used as hostname)
 * by always ensuring the result starts with `/`.
 */
function extractAbsolutePath(rawUrl: string): string {
  const prefix = `${FILE_SCHEMA}://`
  const afterPrefix = decodeURIComponent(rawUrl.slice(prefix.length))
  // Normalise: ensure leading /
  return afterPrefix.startsWith('/') ? afterPrefix : `/${afterPrefix}`
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

    ses.protocol.handle(FILE_SCHEMA, async (request) => {
      const filePath = extractAbsolutePath(request.url)
      const fileUrl = url.pathToFileURL(filePath).toString()

      // Fast-fail if the file does not exist, avoids net::ERR_FAILED noise
      if (!fsSync.existsSync(filePath)) {
        if (!loggedErrorPaths.has(filePath)) {
          loggedErrorPaths.add(filePath)
          console.warn(chalk.yellow(`[FileProtocolModule] File not found: ${filePath}`))
        }
        return new Response('File not found', { status: 404 })
      }

      try {
        return await net.fetch(fileUrl)
      } catch (error) {
        if (!loggedErrorPaths.has(filePath)) {
          loggedErrorPaths.add(filePath)
          console.error(chalk.red('[FileProtocolModule] tfile request error:'), {
            filePath,
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
