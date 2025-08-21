import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { APP_SCHEMA } from '../config/default'
import { TalexTouch } from '../types'
import { PluginResolver, ResolverStatus } from '../plugins/plugin-resolver'
import { genTouchChannel } from '../core/channel-core'
import path from 'path'
import fs from 'fs'
import os from 'os'

function windowsAdapter(touchApp: TalexTouch.TouchApp): void {
  const app = touchApp.app

  app.on('second-instance', (_, argv) => {
    const win = touchApp.window.window

    if (win.isMinimized()) win.restore()
    win.focus()

    const url = argv.find((v) => v.startsWith(`${APP_SCHEMA}://`))
    if (url) {
      onSchema(url)
    }
  })
}

function macOSAdapter(touchApp: TalexTouch.TouchApp): void {
  const app = touchApp.app

  app.on('open-url', (_, url) => {
    onSchema(url)
  })
}

function onSchema(url: string): void {
  console.log('[Addon] Opened schema: ' + url)
}

export default {
  name: Symbol('AddonOpener'),
  filePath: false,
  listeners: new Array<() => void>(),
  init(app: TalexTouch.TouchApp) {
    const touchChannel = genTouchChannel()
    const win = app.window.window

    windowsAdapter(app)
    macOSAdapter(app)

    if (!app.app.isDefaultProtocolClient(APP_SCHEMA)) {
      if (app.app.isPackaged) {
        app.app.setAsDefaultProtocolClient(APP_SCHEMA)
      } else {
        app.app.setAsDefaultProtocolClient(APP_SCHEMA, process.execPath, [
          path.resolve(process.argv[1])
        ])
      }
      // app.app.setAsDefaultProtocolClient(APP_SCHEMA, process.cwd());

      console.log('[Addon] Set as default protocol handler: ' + APP_SCHEMA)
    }

    // protocol.registerFileProtocol('touch-plugin', (request, callback) => {
    //     console.log('[Addon] Protocol opened file: ' + request.url)
    //     const url = request.url.substr(15)
    //     const fileExt = path.extname(url)
    //     if (fileExt === '.touch-plugin') {
    //         return callback({ error: 1, data: 'Unsupported file type' })
    //     }
    //     callback({ path: path.normalize(url) })
    // })

    app.app.on('open-file', (event, filePath) => {
      event.preventDefault()

      console.log('[Addon] Opened file: ' + filePath)

      win.previewFile(filePath)

      touchChannel.send(ChannelType.MAIN, '@open-plugin', filePath)
    })

    this.listeners.push(
      touchChannel.regChannel(
        ChannelType.MAIN,
        '@install-plugin',
        async ({ data: { name, buffer }, reply }) => {
          const tempFilePath = path.join(os.tmpdir(), `talex-touch-plugin-${Date.now()}-${name}`)
          try {
            await fs.promises.writeFile(tempFilePath, buffer)
            await new PluginResolver(tempFilePath).resolve(({ event, type }: any) => {
              console.log('[AddonInstaller] Installed file: ' + name)

              reply(DataCode.SUCCESS, {
                status: type,
                msg: event.msg,
                event
              })
            }, true)
          } catch (e: any) {
            console.error('[AddonInstaller] Error installing plugin:', e)
            reply(DataCode.SUCCESS, { status: 'error', msg: 'INTERNAL_ERROR' })
          } finally {
            fs.promises.unlink(tempFilePath).catch((err) => {
              console.error(`[AddonInstaller] Failed to delete temp file: ${tempFilePath}`, err)
            })
          }
        }
      )
    )

    this.listeners.push(
      touchChannel.regChannel(
        ChannelType.MAIN,
        'drop:plugin',
        async ({ data: { name, buffer }, reply }) => {
          const tempFilePath = path.join(os.tmpdir(), `talex-touch-plugin-${Date.now()}-${name}`)

          try {
            await fs.promises.writeFile(tempFilePath, buffer)

            const pluginResolver = new PluginResolver(tempFilePath)

            await pluginResolver.resolve(({ event, type }: any) => {
              if (type === 'error') {
                console.log('[AddonDropper] Failed to resolve plugin from buffer: ', event)
                if (
                  event.msg === ResolverStatus.MANIFEST_NOT_FOUND ||
                  event.msg === ResolverStatus.INVALID_MANIFEST
                ) {
                  reply(DataCode.SUCCESS, { status: 'error', msg: '10091' }) // Invalid plugin file
                } else {
                  reply(DataCode.SUCCESS, { status: 'error', msg: '10092' }) // Generic error
                }
              } else {
                reply(DataCode.SUCCESS, {
                  status: 'success',
                  manifest: event.msg,
                  msg: '10090'
                })
              }
            })
          } catch (e) {
            console.error('[AddonDropper] Error processing dropped plugin:', e)
            reply(DataCode.SUCCESS, { status: 'error', msg: 'INTERNAL_ERROR' })
          } finally {
            // Clean up the temporary file
            fs.promises.unlink(tempFilePath).catch((err) => {
              console.error(`[AddonDropper] Failed to delete temp file: ${tempFilePath}`, err)
            })
          }
        }
      )
    )
  },
  destroy() {
    this.listeners.forEach((v: () => any) => v())
  }
}
