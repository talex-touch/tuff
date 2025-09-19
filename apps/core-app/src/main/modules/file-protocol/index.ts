import { net, session } from 'electron'
import url from 'url'
import { BaseModule } from '../abstract-base-module'
import { MaybePromise, ModuleKey } from '@talex-touch/utils'

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

    ses.protocol.handle('tfile', (request) => {
      console.debug('tfile request:', request.url)
      const filePath = decodeURIComponent(request.url.slice('tfile://'.length))
      const fileUrl = url.pathToFileURL(`/${filePath}`).toString()
      console.debug('tfile resolved path:', fileUrl)
      return net.fetch(fileUrl)
    })
  }

  onDestroy(): MaybePromise<void> {
    session.defaultSession.protocol.unhandle('tfile')
  }
}

const fileProtocolModule = new FileProtocolModule()

export { fileProtocolModule }
