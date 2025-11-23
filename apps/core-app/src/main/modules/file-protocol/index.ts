import { net, session } from 'electron'
import url from 'url'
import { BaseModule } from '../abstract-base-module'
import { MaybePromise, ModuleKey } from '@talex-touch/utils'
import chalk from 'chalk'
import { FILE_SCHEMA } from '../../config/default'

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
      console.debug('tfile request:', request.url)
      const filePath = decodeURIComponent(request.url.slice(FILE_SCHEMA.length + 3))
      const fileUrl = url.pathToFileURL('/' + filePath).toString()
      console.debug('tfile resolved path:', fileUrl)

      try {
        const response = await net.fetch(fileUrl)
        return response
      } catch (error) {
        console.error(chalk.red('[FileProtocolModule] tfile request error:'), error, {
          filePath,
          fileUrl,
          url: request.url
        })
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
