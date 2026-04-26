import path from 'node:path'
import url from 'node:url'
import { net, protocol } from 'electron'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { createLogger } from '../utils/logger'

protocol.registerSchemesAsPrivileged([{ scheme: 'stream', privileges: { bypassCSP: true } }])

const protocolLog = createLogger('ProtocolHandler')

touchEventBus.on(TalexEvents.APP_READY, () => {
  protocolLog.info('Registering atom file protocol')

  protocol.handle('atom', (request) => {
    const filePath = decodeURI(request.url.slice('atom:///'.length))

    return net.fetch(url.pathToFileURL(path.normalize(filePath)).toString())
  })
})
