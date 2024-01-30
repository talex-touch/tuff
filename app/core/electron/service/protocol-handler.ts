import { protocol } from 'electron'
import path from 'path'
import { TalexEvents, touchEventBus } from "../core/eventbus/touch-event";

protocol.registerSchemesAsPrivileged([
  { scheme: 'stream', privileges: { bypassCSP: true } }
])

touchEventBus.on(TalexEvents.APP_READY, () => {
  console.log('[Service] Register file protocol')

  protocol.interceptFileProtocol('atom', (request, callback) => {
    console.log('[Service] 2 Stream protocol', request.url)
    const url = request.url.substr(7)
    callback(decodeURI(path.normalize(url)))
  })
})