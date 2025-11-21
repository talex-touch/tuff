import type { MaybePromise, ModuleKey } from '@talex-touch/utils'
import url from 'node:url'
import chalk from 'chalk'
import { net, session } from 'electron'
import { BaseModule } from '../abstract-base-module'

class FileProtocolModule extends BaseModule {
  static key: symbol = Symbol.for('FileProtocolModule')
  name: ModuleKey = FileProtocolModule.key

  constructor() {
    super(FileProtocolModule.key, {
      create: false,
    })
  }

  onInit(): MaybePromise<void> {
    const ses = session.defaultSession

    ses.protocol.handle('tfile', async (request) => {
      try {
        const parsedUrl = new URL(request.url)
        const iconRequested = parsedUrl.searchParams.get('icon') === 'true'
        // pathname already includes leading slash (e.g., "/Users/...")
        const filePath = decodeURIComponent(parsedUrl.pathname)

        console.debug('tfile request:', {
          url: request.url,
          filePath,
          iconRequested,
        })

        // Handle icon extraction request
        if (iconRequested) {
          try {
            const extractFileIcon = (await import('extract-file-icon')).default
            if (typeof extractFileIcon !== 'function') {
              console.error(chalk.red('[FileProtocolModule] extract-file-icon not available'))
              return new Response('Icon extraction not available', { status: 500 })
            }

            const buffer = extractFileIcon(filePath, 32)
            if (!buffer || buffer.length === 0) {
              console.warn(chalk.yellow('[FileProtocolModule] No icon extracted for:'), filePath)
              return new Response('No icon available', { status: 404 })
            }

            console.debug(chalk.green('[FileProtocolModule] Icon extracted:'), {
              path: filePath,
              size: buffer.length,
            })

            // Convert Buffer to Uint8Array for Response
            return new Response(new Uint8Array(buffer), {
              headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
              },
            })
          }
          catch (error) {
            console.error(chalk.red('[FileProtocolModule] Icon extraction error:'), error)
            return new Response('Icon extraction failed', { status: 500 })
          }
        }

        // Handle regular file request
        // filePath from pathname already has leading slash
        const fileUrl = url.pathToFileURL(filePath).toString()
        console.debug('tfile resolved path:', fileUrl)

        const response = await net.fetch(fileUrl)
        return response
      }
      catch (error) {
        console.error(chalk.red('[FileProtocolModule] tfile request error:'), error)
        return new Response('File not found', { status: 404 })
      }
    })

    console.log(chalk.green('[FileProtocolModule] tfile protocol registered with icon extraction support'))
  }

  onDestroy(): MaybePromise<void> {
    session.defaultSession.protocol.unhandle('tfile')
  }
}

const fileProtocolModule = new FileProtocolModule()

export { fileProtocolModule }
