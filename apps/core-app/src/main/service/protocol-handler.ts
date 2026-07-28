import { protocol } from 'electron'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { createLogger } from '../utils/logger'

protocol.registerSchemesAsPrivileged([{ scheme: 'stream', privileges: { bypassCSP: true } }])

const protocolLog = createLogger('ProtocolHandler')

touchEventBus.on(TalexEvents.APP_READY, () => {
  protocolLog.info('Registering retired atom protocol compatibility response')
  protocol.handle('atom', () => {
    return new Response('The atom local-file protocol has been removed.', { status: 410 })
  })
})
