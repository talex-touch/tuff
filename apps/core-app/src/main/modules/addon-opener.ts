import type { MaybePromise } from '@talex-touch/utils'
import type { TalexTouch } from '../types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { APP_SCHEMA } from '../config/default'
import { genTouchChannel } from '../core/channel-core'
import { PluginResolver, ResolverStatus } from '../modules/plugin/plugin-resolver'
import { BaseModule } from './abstract-base-module'

function windowsAdapter(touchApp: TalexTouch.TouchApp): void {
  const app = touchApp.app

  app.on('second-instance', (_, argv) => {
    const win = touchApp.window.window

    if (win.isMinimized())
      win.restore()
    win.focus()

    const url = argv.find(v => v.startsWith(`${APP_SCHEMA}://`))
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

interface SchemaHandler {
  pattern: RegExp
  handler: (url: URL, matches: RegExpMatchArray) => void
}

const schemaHandlers: SchemaHandler[] = [
  {
    pattern: /^\/auth\/callback/,
    handler: (url) => {
      const token = url.searchParams.get('token')
      if (token) {
        console.log('[Addon] Auth callback received, token length:', token.length)
        const touchChannel = genTouchChannel()
        touchChannel.send(ChannelType.MAIN, 'auth:external-callback', { token })
      }
      else {
        console.warn('[Addon] Auth callback received without token')
      }
    },
  },
]

function onSchema(rawUrl: string): void {
  console.log(`[Addon] Opened schema: ${rawUrl}`)

  try {
    const url = new URL(rawUrl)
    const pathname = url.pathname

    for (const { pattern, handler } of schemaHandlers) {
      const matches = pathname.match(pattern)
      if (matches) {
        handler(url, matches)
        return
      }
    }

    console.log(`[Addon] No handler matched for path: ${pathname}`)
  }
  catch (error) {
    console.error('[Addon] Failed to parse schema URL:', error)
  }
}

export class AddonOpenerModule extends BaseModule {
  static key: symbol = Symbol.for('AddonOpener')
  name: symbol = AddonOpenerModule.key

  constructor() {
    super(AddonOpenerModule.key, {
      create: false,
    })
  }

  onInit(): MaybePromise<void> {
    const touchChannel = genTouchChannel()
    const win = $app.window.window

    windowsAdapter($app)
    macOSAdapter($app)

    // Register protocol handler
    // In dev mode, we need to register with the correct electron executable path
    const registerProtocol = () => {
      if ($app.app.isPackaged) {
        // Production: register with bundled app
        $app.app.setAsDefaultProtocolClient(APP_SCHEMA)
      }
      else {
        // Development: need to use electron-vite's dev server path
        // On macOS, we need to pass the project path as argument
        const electronPath = process.execPath
        const appPath = path.resolve(process.cwd())

        // Remove old registration first to ensure clean state
        $app.app.removeAsDefaultProtocolClient(APP_SCHEMA)

        // Register with electron binary and project path
        $app.app.setAsDefaultProtocolClient(APP_SCHEMA, electronPath, [
          '--inspect',
          appPath,
        ])

        console.log(`[Addon] Dev mode protocol registration:`)
        console.log(`  - electronPath: ${electronPath}`)
        console.log(`  - appPath: ${appPath}`)
      }
      console.log(`[Addon] Set as default protocol handler: ${APP_SCHEMA}`)
    }

    if (!$app.app.isDefaultProtocolClient(APP_SCHEMA)) {
      registerProtocol()
    }
    else {
      console.log(`[Addon] Already registered as protocol handler: ${APP_SCHEMA}`)
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

    $app.app.on('open-file', (event, filePath) => {
      event.preventDefault()

      console.log(`[Addon] Opened file: ${filePath}`)

      win.previewFile(filePath)

      touchChannel.send(ChannelType.MAIN, '@open-plugin', filePath)
    })

    touchChannel.regChannel(
      ChannelType.MAIN,
      '@install-plugin',
      async ({ data: { name, buffer, forceUpdate }, reply }) => {
        const tempFilePath = path.join(os.tmpdir(), `talex-touch-plugin-${Date.now()}-${name}`)
        try {
          await fs.promises.writeFile(tempFilePath, buffer)
          await new PluginResolver(tempFilePath).resolve(({ event, type }: any) => {
            if (type === 'error') {
              console.error(`[AddonInstaller] Installation failed for ${name}:`, event.msg)
            }

            reply(DataCode.SUCCESS, {
              status: type,
              msg: event.msg,
              event,
            })
          }, true, { installOptions: { forceUpdate: Boolean(forceUpdate), autoReEnable: true } })
        }
        catch (e: any) {
          console.error('[AddonInstaller] Error installing plugin:', e)
          reply(DataCode.SUCCESS, { status: 'error', msg: e.message || 'INTERNAL_ERROR' })
        }
        finally {
          fs.promises.unlink(tempFilePath).catch((err) => {
            console.error(`[AddonInstaller] Failed to delete temp file: ${tempFilePath}`, err)
          })
        }
      },
    )

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
              console.error('[AddonDropper] Failed to resolve plugin from buffer:', event)
              if (
                event.msg === ResolverStatus.MANIFEST_NOT_FOUND
                || event.msg === ResolverStatus.INVALID_MANIFEST
              ) {
                reply(DataCode.SUCCESS, { status: 'error', msg: '10091' })
              }
              else {
                reply(DataCode.SUCCESS, { status: 'error', msg: '10092' })
              }
              
              // Clean up temp file on error
              fs.promises.unlink(tempFilePath).catch((err) => {
                console.error(`[AddonDropper] Failed to delete temp file: ${tempFilePath}`, err)
              })
            }
            else {
              reply(DataCode.SUCCESS, {
                status: 'success',
                manifest: event.msg,
                path: tempFilePath,
                msg: '10090',
              })
              
              // Clean up temp file after 30 seconds (user has time to click install)
              setTimeout(() => {
                fs.promises.unlink(tempFilePath).catch((err) => {
                  console.error(`[AddonDropper] Failed to delete temp file: ${tempFilePath}`, err)
                })
              }, 30000)
            }
          })
        }
        catch (e) {
          console.error('[AddonDropper] Error processing dropped plugin:', e)
          reply(DataCode.SUCCESS, { status: 'error', msg: 'INTERNAL_ERROR' })
          
          // Clean up temp file on error
          fs.promises.unlink(tempFilePath).catch((err) => {
            console.error(`[AddonDropper] Failed to delete temp file: ${tempFilePath}`, err)
          })
        }
      },
    )
  }

  onDestroy(): MaybePromise<void> {
    console.log('[AddonOpener] AddonOpenerModule destroyed')
  }
}

const addonOpenerModule = new AddonOpenerModule()

export { addonOpenerModule }
