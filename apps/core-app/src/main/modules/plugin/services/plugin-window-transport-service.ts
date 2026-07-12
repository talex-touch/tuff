import type { TalexTouch } from '@talex-touch/utils'
import type { IPluginManager } from '@talex-touch/utils/plugin'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { Logger } from '../../../utils/logger'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { TouchWindow } from '../../../core/touch-window'
import { buildWindowWebPreferences } from '../../../core/window-security-profile'
import { useAliveTarget } from '../../../hooks/use-electron-guard'
import { TouchPlugin } from '../plugin'
import { usePluginInjections } from '../runtime/plugin-injections'
import { resolvePluginViewSecurityProfile } from '../runtime/plugin-view-security-profile'

type TransportDisposer = () => void

type WindowNewPayload = TalexTouch.TouchWindowConstructorOptions & {
  file?: string
  url?: string
}

interface WindowVisiblePayload {
  id: number
  visible?: boolean
}

interface WindowPropertyPayload {
  id: number
  property: {
    window?: Record<string, unknown>
    webContents?: Record<string, unknown>
  }
}

interface IndexCommunicatePayload {
  key?: string
  info?: unknown
}

export interface PluginWindowTransportContext {
  manager: IPluginManager
  transport: ITuffTransportMain
  requiresLegacyWindowRuntime: (webPreferences?: Electron.WebPreferences) => boolean
  ipcLog: Pick<Logger, 'info'>
  logHandlerError: (handler: string, error: unknown) => void
  toErrorMessage: (error: unknown) => string
}

/** Registers window and plugin-message handlers and returns their transport disposers. */
export function registerPluginWindowTransportHandlers(
  context: PluginWindowTransportContext
): TransportDisposer[] {
  const {
    manager,
    transport,
    requiresLegacyWindowRuntime,
    ipcLog: pluginIpcLog,
    logHandlerError: logIpcHandlerError,
    toErrorMessage
  } = context
  const disposers: TransportDisposer[] = []

  disposers.push(
    transport.on(PluginEvents.window.new, async (data: WindowNewPayload, context) => {
      const pluginName = context.plugin?.name
      const touchPlugin = pluginName ? (manager.plugins.get(pluginName) as TouchPlugin) : undefined
      if (!touchPlugin) {
        return { error: 'Plugin not found!' }
      }

      const { file, url, ...windowOptions } = data
      const obj = usePluginInjections(touchPlugin, 'plugin-module:window:new')
      if (!obj) {
        return { error: 'Failed to build plugin injections' }
      }

      const windowPreload = obj._.preload ?? windowOptions.webPreferences?.preload
      const securityProfile = resolvePluginViewSecurityProfile(touchPlugin, {
        source: 'plugin-module:window:new',
        injections: {
          _: {
            ...obj._,
            preload: windowPreload
          }
        },
        requiresLegacyRuntime: requiresLegacyWindowRuntime(windowOptions.webPreferences)
      })
      pluginIpcLog.info('Resolved plugin window security profile', {
        meta: {
          plugin: touchPlugin.name,
          candidateProfile: securityProfile.candidateProfile,
          effectiveProfile: securityProfile.effectiveProfile,
          reason: securityProfile.reason
        }
      })

      const win = new TouchWindow({
        ...windowOptions,
        webPreferences: buildWindowWebPreferences(securityProfile.effectiveProfile, {
          ...(windowOptions.webPreferences ?? {}),
          preload: windowPreload
        })
      })
      let webContents: Electron.WebContents
      if (typeof file === 'string' && file.length > 0) {
        webContents = await win.loadFile(file)
      } else if (typeof url === 'string' && url.length > 0) {
        webContents = await win.loadURL(url)
      } else {
        return { error: 'No file or url provided!' }
      }

      await webContents.insertCSS(obj.styles)
      await webContents.executeJavaScript(obj.js)

      webContents.send('@loaded', {
        id: webContents.id,
        plugin: pluginName,
        type: 'intend'
      })

      touchPlugin._windows.set(webContents.id, win)
      win.window.on('closed', () => {
        win.window.removeAllListeners()
        touchPlugin._windows.delete(webContents.id)
      })

      return { id: webContents.id }
    }),

    transport.on(PluginEvents.window.visible, async (payload: WindowVisiblePayload, context) => {
      const pluginName = context.plugin?.name
      const touchPlugin = pluginName ? (manager.plugins.get(pluginName) as TouchPlugin) : undefined
      if (!touchPlugin) {
        return { error: 'Plugin not found!' }
      }

      const id = payload?.id
      if (typeof id !== 'number') {
        return { error: 'Window id is required' }
      }

      const win = touchPlugin._windows.get(id)
      const browserWindow = useAliveTarget(win?.window)
      if (!win || !browserWindow) {
        return { error: 'Window not found' }
      }

      if (payload?.visible === undefined) {
        if (browserWindow.isVisible()) {
          browserWindow.hide()
        } else {
          browserWindow.show()
        }
      } else if (payload.visible) {
        browserWindow.show()
      } else {
        browserWindow.hide()
      }

      return { visible: browserWindow.isVisible() }
    }),

    transport.on(PluginEvents.window.property, async (payload: WindowPropertyPayload, context) => {
      const pluginName = context.plugin?.name
      const touchPlugin = pluginName ? (manager.plugins.get(pluginName) as TouchPlugin) : undefined
      if (!touchPlugin) {
        return { error: 'Plugin not found!' }
      }

      const id = payload?.id
      const property = payload?.property
      if (typeof id !== 'number') {
        return { error: 'Window id is required' }
      }
      if (!property) {
        return { error: 'Property is required' }
      }

      const win = touchPlugin._windows.get(id)
      const browserWindow = useAliveTarget(win?.window)
      if (!win || !browserWindow) {
        return { error: 'Window not found' }
      }

      const applyProps = (target: Record<string, unknown>, props?: Record<string, unknown>) => {
        if (!props) return { success: true }
        for (const [key, value] of Object.entries(props)) {
          if (value === undefined) continue
          try {
            const current = target[key]
            if (typeof current === 'function') {
              if (Array.isArray(value)) {
                current(...value)
              } else {
                current(value)
              }
            } else {
              target[key] = value
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return { success: false, error: `Failed to set ${key}: ${message}` }
          }
        }
        return { success: true }
      }

      const windowResult = applyProps(
        browserWindow as unknown as Record<string, unknown>,
        property.window
      )
      if (!windowResult.success) {
        return windowResult
      }

      const webContentsResult = applyProps(
        browserWindow.webContents as unknown as Record<string, unknown>,
        property.webContents
      )
      if (!webContentsResult.success) {
        return webContentsResult
      }

      return { success: true }
    }),

    transport.on(PluginEvents.communicate.index, async (data: IndexCommunicatePayload, context) => {
      try {
        const pluginName = context.plugin?.name
        const key = typeof data?.key === 'string' ? data.key : ''
        const info = data?.info

        if (!pluginName || !key) {
          return { error: 'Plugin name and key are required' }
        }

        const plugin = manager.getPluginByName(pluginName) as TouchPlugin
        if (!plugin) {
          return { error: `Plugin ${pluginName} not found` }
        }

        const lifecycle = plugin.getFeatureLifeCycle?.()
        if (!lifecycle || !lifecycle.onMessage) {
          return { error: `Plugin ${pluginName} does not have onMessage handler` }
        }

        lifecycle.onMessage(key, info)
        return { status: 'message_sent' }
      } catch (error) {
        logIpcHandlerError('index:communicate', error)
        return { error: toErrorMessage(error) }
      }
    })
  )

  return disposers
}
