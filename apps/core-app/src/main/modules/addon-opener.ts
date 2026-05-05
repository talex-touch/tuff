import type { MaybePromise, ModuleInitContext } from '@talex-touch/utils'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { APP_SCHEMA } from '../config/default'
import type { DevPluginInstallResult } from '../modules/plugin/dev-plugin-installer'
import { installDevPluginFromPath } from '../modules/plugin/dev-plugin-installer'
import { PluginResolver, ResolverStatus } from '../modules/plugin/plugin-resolver'
import type { AppSecondaryLaunch } from '../core/eventbus/touch-event'
import { TalexEvents } from '../core/eventbus/touch-event'
import { resolveMainRuntime } from '../core/runtime-accessor'
import { createLogger } from '../utils/logger'
import { BaseModule } from './abstract-base-module'
import { focusMainWindowIfAlive, registerMacOSOpenUrlHandler } from './addon-opener-handlers'
import { applyExternalAuthCallback, applyStepUpToken } from './auth'

type ChannelKeyManagerHolder = {
  keyManager?: unknown
}

const resolveKeyManager = (channel: unknown): unknown => {
  if (!channel || typeof channel !== 'object') return channel
  if (!('keyManager' in channel)) return channel
  return (channel as ChannelKeyManagerHolder).keyManager ?? channel
}

const addonOpenerLog = createLogger('AddonOpener')
const openPluginEvent = defineRawEvent<string, void>('@open-plugin')
const installPluginEvent = defineRawEvent<
  { name: string; buffer: Buffer; forceUpdate?: boolean },
  unknown
>('@install-plugin')
const installDevPluginEvent = defineRawEvent<
  { path: string; forceUpdate?: boolean },
  DevPluginInstallResult
>('plugin:install-dev')
const dropPluginEvent = defineRawEvent<{ name: string; buffer: Buffer }, unknown>('drop:plugin')

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
        void applyExternalAuthCallback(token, appToken)
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
        applyStepUpToken(loginToken)
      } else {
        addonOpenerLog.warn('Step-up callback received without token')
      }
    }
  }
]

function normalizeSchemaRoute(url: URL): string {
  const hostname = (url.hostname || '').trim().toLowerCase()
  const pathname = url.pathname || '/'

  if (!hostname) {
    return pathname
  }

  if (pathname === '/' || !pathname) {
    return `/${hostname}`
  }

  return `/${hostname}${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}

function maskSchemaUrlForLog(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    const sensitiveKeys = ['token', 'app_token', 'login_token']
    sensitiveKeys.forEach((key) => {
      if (!url.searchParams.has(key)) return
      const value = url.searchParams.get(key) || ''
      url.searchParams.set(key, value ? `***(${value.length})` : '***')
    })
    return url.toString()
  } catch {
    return rawUrl
  }
}

function onSchema(rawUrl: string): void {
  addonOpenerLog.debug(`Opened schema: ${maskSchemaUrlForLog(rawUrl)}`)

  try {
    const url = new URL(rawUrl)
    const pathname = normalizeSchemaRoute(url)

    for (const { pattern, handler } of schemaHandlers) {
      const matches = pathname.match(pattern)
      if (matches) {
        handler(url, matches)
        return
      }
    }

    addonOpenerLog.warn(`No handler matched for path: ${pathname}`, {
      meta: {
        host: url.hostname,
        rawPathname: url.pathname
      }
    })
  } catch (error) {
    addonOpenerLog.error('Failed to parse schema URL', { error })
  }
}

export class AddonOpenerModule extends BaseModule {
  static key: symbol = Symbol.for('AddonOpener')
  name: symbol = AddonOpenerModule.key
  private appDisposers: Array<() => void> = []
  private transportDisposers: Array<() => void> = []

  constructor() {
    super(AddonOpenerModule.key, {
      create: false
    })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const runtime = resolveMainRuntime(ctx, 'AddonOpenerModule.onInit')
    const touchApp = runtime.app
    const channel = runtime.channel
    const transport = getTuffTransportMain(channel, resolveKeyManager(channel))
    const app = touchApp.app
    const win = touchApp.window.window

    this.appDisposers.push(
      this.on(ctx, TalexEvents.APP_SECONDARY_LAUNCH, (event) => {
        const secondaryLaunch = event as AppSecondaryLaunch
        const focused = focusMainWindowIfAlive(touchApp.window.window)
        if (!focused) {
          addonOpenerLog.warn(
            'Skip focusing main window for secondary launch because it is unavailable'
          )
        }

        const url = secondaryLaunch.argv.find((value) => value.startsWith(`${APP_SCHEMA}://`))
        if (url) {
          onSchema(url)
        }
      })
    )

    if (process.platform === 'darwin') {
      registerMacOSOpenUrlHandler(app, onSchema, (disposer) => this.appDisposers.push(disposer))
    }

    // Register protocol handler
    // In dev mode, we need to register with the correct electron executable path
    const registerProtocol = () => {
      if (app.isPackaged) {
        // Production: register with bundled app
        app.setAsDefaultProtocolClient(APP_SCHEMA)
      } else {
        // Development: need to use electron-vite's dev server path
        // On macOS, we need to pass the project path as argument
        const electronPath = process.execPath
        const appPath = path.resolve(process.cwd())

        // Remove old registration first to ensure clean state
        app.removeAsDefaultProtocolClient(APP_SCHEMA)

        // Register with electron binary and project path
        app.setAsDefaultProtocolClient(APP_SCHEMA, electronPath, ['--inspect', appPath])

        addonOpenerLog.debug('Dev mode protocol registration', {
          meta: {
            electronPath,
            appPath
          }
        })
      }
      addonOpenerLog.debug(`Set as default protocol handler: ${APP_SCHEMA}`)
    }

    if (!app.isDefaultProtocolClient(APP_SCHEMA)) {
      registerProtocol()
    } else {
      addonOpenerLog.debug(`Already registered as protocol handler: ${APP_SCHEMA}`)
    }

    const onOpenFile = (event: { preventDefault: () => void }, filePath: string) => {
      event.preventDefault()

      addonOpenerLog.debug(`Opened file: ${filePath}`)

      win.previewFile(filePath)

      void transport.sendTo(win.webContents, openPluginEvent, filePath)
    }
    app.on('open-file', onOpenFile)
    this.appDisposers.push(() => {
      app.off('open-file', onOpenFile)
    })

    this.transportDisposers.push(
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
    )

    this.transportDisposers.push(
      transport.on(installDevPluginEvent, async (payload) => {
        const sourcePath = payload?.path
        if (!sourcePath) {
          return { status: 'error', error: 'INVALID_PATH' }
        }
        return await installDevPluginFromPath(sourcePath, {
          forceUpdate: Boolean(payload?.forceUpdate)
        })
      })
    )

    this.transportDisposers.push(
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
                  addonOpenerLog.error(`Failed to delete temp file: ${tempFilePath}`, {
                    error: err
                  })
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
    )
  }

  onDestroy(): MaybePromise<void> {
    for (const disposer of this.transportDisposers) {
      try {
        disposer()
      } catch {
        // ignore cleanup errors
      }
    }
    this.transportDisposers = []

    for (const disposer of this.appDisposers) {
      try {
        disposer()
      } catch {
        // ignore cleanup errors
      }
    }
    this.appDisposers = []

    addonOpenerLog.info('AddonOpenerModule destroyed')
  }
}

const addonOpenerModule = new AddonOpenerModule()

export { addonOpenerModule }
