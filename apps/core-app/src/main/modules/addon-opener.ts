import type { MaybePromise } from '@talex-touch/utils'
import type { TalexTouch } from '../types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { APP_SCHEMA } from '../config/default'
import { PluginResolver, ResolverStatus } from '../modules/plugin/plugin-resolver'
import { createLogger } from '../utils/logger'
import { BaseModule } from './abstract-base-module'

type ChannelKeyManagerHolder = {
  keyManager?: unknown
}

const resolveKeyManager = (channel: unknown): unknown => {
  if (!channel || typeof channel !== 'object') return channel
  if (!('keyManager' in channel)) return channel
  return (channel as ChannelKeyManagerHolder).keyManager ?? channel
}

const addonOpenerLog = createLogger('AddonOpener')
const authExternalCallbackEvent = defineRawEvent<{ token: string; appToken?: string }, void>(
  'auth:external-callback'
)
const authStepUpCallbackEvent = defineRawEvent<{ loginToken: string }, void>('auth:stepup-callback')
const openPluginEvent = defineRawEvent<string, void>('@open-plugin')
const installPluginEvent = defineRawEvent<
  { name: string; buffer: Buffer; forceUpdate?: boolean },
  unknown
>('@install-plugin')
const dropPluginEvent = defineRawEvent<{ name: string; buffer: Buffer }, unknown>('drop:plugin')

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

interface SchemaHandler {
  pattern: RegExp
  handler: (url: URL, matches: RegExpMatchArray) => void
}

const schemaHandlers: SchemaHandler[] = [
  {
    pattern: /^\/auth\/callback/,
    handler: (url) => {
      const token = url.searchParams.get('token') || ''
      const appToken = url.searchParams.get('app_token') || ''
      if (token || appToken) {
        if (token) {
          addonOpenerLog.debug('Auth callback received', { meta: { tokenLength: token.length } })
        }
        if (appToken) {
          addonOpenerLog.debug('Auth callback received', {
            meta: { appTokenLength: appToken.length }
          })
        }
        const channel = $app.channel
        const transport = getTuffTransportMain(channel, resolveKeyManager(channel))
        void transport.sendTo($app.window.window.webContents, authExternalCallbackEvent, {
          token,
          appToken
        })
      } else {
        addonOpenerLog.warn('Auth callback received without token')
      }
    }
  },
  {
    pattern: /^\/auth\/stepup/,
    handler: (url) => {
      const loginToken = url.searchParams.get('login_token') || ''
      if (loginToken) {
        addonOpenerLog.debug('Step-up callback received', {
          meta: { tokenLength: loginToken.length }
        })
        const channel = $app.channel
        const transport = getTuffTransportMain(channel, resolveKeyManager(channel))
        void transport.sendTo($app.window.window.webContents, authStepUpCallbackEvent, {
          loginToken
        })
      } else {
        addonOpenerLog.warn('Step-up callback received without token')
      }
    }
  }
]

function onSchema(rawUrl: string): void {
  addonOpenerLog.info(`Opened schema: ${rawUrl}`)

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

    addonOpenerLog.warn(`No handler matched for path: ${pathname}`)
  } catch (error) {
    addonOpenerLog.error('Failed to parse schema URL', { error })
  }
}

export class AddonOpenerModule extends BaseModule {
  static key: symbol = Symbol.for('AddonOpener')
  name: symbol = AddonOpenerModule.key

  constructor() {
    super(AddonOpenerModule.key, {
      create: false
    })
  }

  onInit(): MaybePromise<void> {
    const channel = $app.channel
    const transport = getTuffTransportMain(channel, resolveKeyManager(channel))
    const win = $app.window.window

    windowsAdapter($app)
    macOSAdapter($app)

    // Register protocol handler
    // In dev mode, we need to register with the correct electron executable path
    const registerProtocol = () => {
      if ($app.app.isPackaged) {
        // Production: register with bundled app
        $app.app.setAsDefaultProtocolClient(APP_SCHEMA)
      } else {
        // Development: need to use electron-vite's dev server path
        // On macOS, we need to pass the project path as argument
        const electronPath = process.execPath
        const appPath = path.resolve(process.cwd())

        // Remove old registration first to ensure clean state
        $app.app.removeAsDefaultProtocolClient(APP_SCHEMA)

        // Register with electron binary and project path
        $app.app.setAsDefaultProtocolClient(APP_SCHEMA, electronPath, ['--inspect', appPath])

        addonOpenerLog.debug('Dev mode protocol registration', {
          meta: {
            electronPath,
            appPath
          }
        })
      }
      addonOpenerLog.info(`Set as default protocol handler: ${APP_SCHEMA}`)
    }

    if (!$app.app.isDefaultProtocolClient(APP_SCHEMA)) {
      registerProtocol()
    } else {
      addonOpenerLog.info(`Already registered as protocol handler: ${APP_SCHEMA}`)
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

      addonOpenerLog.info(`Opened file: ${filePath}`)

      win.previewFile(filePath)

      void transport.sendTo(win.webContents, openPluginEvent, filePath)
    })

    transport.on(installPluginEvent, async (payload) => {
      const { name, buffer, forceUpdate } = payload ?? {}
      const tempFilePath = path.join(os.tmpdir(), `talex-touch-plugin-${Date.now()}-${name}`)
      try {
        await fs.promises.writeFile(tempFilePath, buffer)
        let lastEvent: { status: string; msg: unknown; event?: unknown } | null = null
        await new PluginResolver(tempFilePath).resolve(
          ({ event, type }: { event: { msg: unknown }; type: string }) => {
            if (type === 'error') {
              addonOpenerLog.error(`Installation failed for ${name}`, { error: event.msg })
            }
            lastEvent = { status: type, msg: event.msg, event }
          },
          true,
          { installOptions: { forceUpdate: Boolean(forceUpdate), autoReEnable: true } }
        )
        return lastEvent ?? { status: 'success', msg: null }
      } catch (error: unknown) {
        addonOpenerLog.error('Error installing plugin', { error })
        return {
          status: 'error',
          msg: error instanceof Error ? error.message : 'INTERNAL_ERROR'
        }
      } finally {
        fs.promises.unlink(tempFilePath).catch((err) => {
          addonOpenerLog.error(`Failed to delete temp file: ${tempFilePath}`, { error: err })
        })
      }
    })

    transport.on(dropPluginEvent, async (payload) => {
      const { name, buffer } = payload ?? {}
      const tempFilePath = path.join(os.tmpdir(), `talex-touch-plugin-${Date.now()}-${name}`)
      try {
        await fs.promises.writeFile(tempFilePath, buffer)

        const pluginResolver = new PluginResolver(tempFilePath)

        let result: Record<string, unknown> | null = null
        await pluginResolver.resolve(
          ({ event, type }: { event: { msg: unknown }; type: string }) => {
            if (type === 'error') {
              addonOpenerLog.error('Failed to resolve plugin from buffer', { error: event })
              if (
                event.msg === ResolverStatus.MANIFEST_NOT_FOUND ||
                event.msg === ResolverStatus.INVALID_MANIFEST
              ) {
                result = { status: 'error', msg: '10091' }
              } else {
                result = { status: 'error', msg: '10092' }
              }

              fs.promises.unlink(tempFilePath).catch((err) => {
                addonOpenerLog.error(`Failed to delete temp file: ${tempFilePath}`, { error: err })
              })
            } else {
              result = {
                status: 'success',
                manifest: event.msg,
                path: tempFilePath,
                msg: '10090'
              }

              setTimeout(() => {
                fs.promises.unlink(tempFilePath).catch((err) => {
                  addonOpenerLog.error(`Failed to delete temp file: ${tempFilePath}`, {
                    error: err
                  })
                })
              }, 30000)
            }
          }
        )

        return result ?? { status: 'error', msg: 'INTERNAL_ERROR' }
      } catch (e) {
        addonOpenerLog.error('Error processing dropped plugin', { error: e })
        fs.promises.unlink(tempFilePath).catch((err) => {
          addonOpenerLog.error(`Failed to delete temp file: ${tempFilePath}`, { error: err })
        })
        return { status: 'error', msg: 'INTERNAL_ERROR' }
      }
    })
  }

  onDestroy(): MaybePromise<void> {
    addonOpenerLog.info('AddonOpenerModule destroyed')
  }
}

const addonOpenerModule = new AddonOpenerModule()

export { addonOpenerModule }
