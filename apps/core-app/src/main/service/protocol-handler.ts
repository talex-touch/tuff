import { protocol, net } from 'electron'
import path from 'node:path'
import url from 'node:url'
import { TalexEvents, touchEventBus } from "../core/eventbus/touch-event";

protocol.registerSchemesAsPrivileged([
  { scheme: 'stream', privileges: { bypassCSP: true } }
])

touchEventBus.on(TalexEvents.APP_READY, () => {
  console.log('[Service] Register file protocol')

  protocol.handle('atom', (request) => {
    const filePath = decodeURI(request.url.slice('atom:///'.length))

    return net.fetch(url.pathToFileURL(path.normalize(filePath)).toString())  //net.fetch(decodeURI(filePath))
  })
  // protocol.interceptFileProtocol('atom', (request, callback) => {
  //   console.log('[Service] 2 Stream protocol', request.url)
  //   const url = request.url.substr(7)
  //   callback(decodeURI(path.normalize(url)))
  // })

  // protocol.registerFileProtocol('etom', (request, callback) => {
  //   console.log("Aaaa", request, callback)
  //   // const url = request.url.substr(8); // 去掉协议头 'myapp://'
  //   // const decodedUrl = decodeURIComponent(url); // 解码 URL
  //   // try {
  //   //   // 返回图片的本地路径
  //   //   return callback(decodedUrl);
  //   // } catch (error) {
  //   //   console.error('Failed to register protocol', error);
  //   // }
  // });

})