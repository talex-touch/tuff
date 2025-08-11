import { TalexTouch } from '../../types'
import { net, session } from 'electron'
import url from 'url'

const FileProtocolModule: TalexTouch.IModule = {
  name: Symbol('FileProtocolModule'),
  init: () => {
    const ses = session.defaultSession

    ses.protocol.handle('tfile', (request) => {
      console.debug('tfile request:', request.url)
      const filePath = decodeURIComponent(request.url.slice('tfile://'.length))
      const fileUrl = url.pathToFileURL(`/${filePath}`).toString()
      console.debug('tfile resolved path:', fileUrl)
      return net.fetch(fileUrl)
    })
  },
  destroy: () => {
    session.defaultSession.protocol.unhandle('tfile')
  }
}

export default FileProtocolModule
