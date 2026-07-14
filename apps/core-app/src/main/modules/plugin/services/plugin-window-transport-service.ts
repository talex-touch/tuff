import type { IPluginManager } from '@talex-touch/utils/plugin'
import type {
  PluginWindowCommandRequest,
  PluginWindowCommandResponse,
  PluginWindowErrorCode,
  PluginWindowNewRequest,
  PluginWindowNewResponse,
  PluginWindowPropertyRequest,
  PluginWindowPropertyResponse,
  PluginWindowVisibleRequest,
  PluginWindowVisibleResponse
} from '@talex-touch/utils/transport/events/types'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { Logger } from '../../../utils/logger'
import { pathToFileURL } from 'node:url'
import { StorageList } from '@talex-touch/utils'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { PLUGIN_WINDOW_ERROR_CODES } from '@talex-touch/utils/transport/events/types'
import { TouchWindow } from '../../../core/touch-window'
import { useAliveTarget } from '../../../hooks/use-electron-guard'
import { createProtectedRegister } from '../../permission'
import { getMainConfig } from '../../storage'
import { TouchPlugin } from '../plugin'
import { usePluginInjections } from '../runtime/plugin-injections'
import { resolvePluginViewSecurityProfile } from '../runtime/plugin-view-security-profile'
import {
  buildPluginViewWebPreferences,
  buildPublicPluginWindowOptions
} from '../runtime/plugin-view-host'
import {
  createPluginViewNavigationPolicy,
  executePluginWindowCommand,
  installPluginViewNavigationPolicy,
  normalizePluginWindowCommand,
  normalizePluginWindowRequest,
  resolveLocalPluginWindowTarget,
  toPluginWindowErrorData,
  translateLegacyWindowProperty
} from '../runtime/plugin-window-policy'
type TransportDisposer = () => void

interface IndexCommunicatePayload {
  key?: string
  info?: unknown
}

export interface PluginWindowTransportContext {
  manager: IPluginManager
  transport: ITuffTransportMain
  ipcLog: Pick<Logger, 'info' | 'warn'>
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
    ipcLog: pluginIpcLog,
    logHandlerError: logIpcHandlerError,
    toErrorMessage
  } = context
  const disposers: TransportDisposer[] = []
  const registerProtectedWindowChannel = createProtectedRegister(transport)
  const protectedWindowOptions = {
    permissionId: 'window.create',
    failClosedForPlugin: true,
    requireVerifiedPlugin: true,
    unavailableCode: PLUGIN_WINDOW_ERROR_CODES.PERMISSION_UNAVAILABLE,
    deniedCode: PLUGIN_WINDOW_ERROR_CODES.PERMISSION_DENIED,
    sdkMismatchCode: 'SDKAPI_MISMATCH'
  } as const
  const windowError = (code: PluginWindowErrorCode, message: string) => ({
    error: { code, message }
  })

  disposers.push(
    registerProtectedWindowChannel<PluginWindowNewRequest, PluginWindowNewResponse>(
      PluginEvents.window.new,
      protectedWindowOptions,
      async (data, requestContext) => {
        const pluginName = requestContext.plugin?.name
        const touchPlugin = pluginName
          ? (manager.plugins.get(pluginName) as TouchPlugin)
          : undefined
        if (!touchPlugin) {
          return windowError(PLUGIN_WINDOW_ERROR_CODES.NOT_FOUND, 'Plugin not found.')
        }

        try {
          const request = normalizePluginWindowRequest(data)
          const target = await resolveLocalPluginWindowTarget(touchPlugin.pluginPath, request.file)
          const obj = usePluginInjections(touchPlugin, 'plugin-module:window:new')
          if (!obj) {
            return windowError(
              PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
              'Plugin window initialization failed.'
            )
          }

          const securityProfile = resolvePluginViewSecurityProfile(touchPlugin, {
            source: 'plugin-module:window:new',
            injections: obj
          })
          pluginIpcLog.info('Resolved plugin window security profile', {
            meta: {
              plugin: touchPlugin.name,
              candidateProfile: securityProfile.candidateProfile,
              effectiveProfile: securityProfile.effectiveProfile,
              reason: securityProfile.reason
            }
          })

          const webPreferences = buildPluginViewWebPreferences(securityProfile.effectiveProfile, {
            plugin: touchPlugin,
            themeStyle: getMainConfig(StorageList.THEME_STYLE) ?? {},
            source: `public-window:${target}`,
            legacyPreload: obj._.preload
          })
          const navigationPolicy = await createPluginViewNavigationPolicy({
            pluginRoot: touchPlugin.pluginPath,
            targetUrl: pathToFileURL(target).href,
            securityProfile: securityProfile.effectiveProfile,
            allowLegacyWebview: securityProfile.reason === 'legacy-webview'
          })
          const win = new TouchWindow(
            buildPublicPluginWindowOptions(request.options ?? {}, webPreferences)
          )

          let webContents: Electron.WebContents
          try {
            installPluginViewNavigationPolicy(win.window.webContents, navigationPolicy)
            webContents = await win.loadFile(target)
          } catch (error) {
            win.close()
            throw error
          }

          if (obj.styles) {
            await webContents.insertCSS(obj.styles)
          }
          if (securityProfile.effectiveProfile === 'compat-plugin-view' && obj.js) {
            await webContents.executeJavaScript(obj.js)
          }

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
        } catch (error) {
          const publicError = toPluginWindowErrorData(error)
          pluginIpcLog.warn('Blocked plugin window creation', {
            meta: { plugin: touchPlugin.name, code: publicError.code }
          })
          return { error: publicError }
        }
      }
    ),

    registerProtectedWindowChannel<PluginWindowVisibleRequest, PluginWindowVisibleResponse>(
      PluginEvents.window.visible,
      protectedWindowOptions,
      async (payload, requestContext) => {
        const pluginName = requestContext.plugin?.name
        const touchPlugin = pluginName
          ? (manager.plugins.get(pluginName) as TouchPlugin)
          : undefined
        if (!touchPlugin) {
          return windowError(PLUGIN_WINDOW_ERROR_CODES.NOT_FOUND, 'Plugin not found.')
        }

        const id = payload?.id
        if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
          return windowError(
            PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
            'A valid window id is required.'
          )
        }
        if (payload.visible !== undefined && typeof payload.visible !== 'boolean') {
          return windowError(
            PLUGIN_WINDOW_ERROR_CODES.OPTIONS_INVALID,
            'Window visibility must be a boolean.'
          )
        }

        const win = touchPlugin._windows.get(id)
        const browserWindow = useAliveTarget(win?.window)
        if (!win || !browserWindow) {
          return windowError(PLUGIN_WINDOW_ERROR_CODES.NOT_FOUND, 'Window not found.')
        }

        if (payload.visible === undefined) {
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
      }
    ),

    registerProtectedWindowChannel<PluginWindowCommandRequest, PluginWindowCommandResponse>(
      PluginEvents.window.command,
      protectedWindowOptions,
      async (payload, requestContext) => {
        const pluginName = requestContext.plugin?.name
        const touchPlugin = pluginName
          ? (manager.plugins.get(pluginName) as TouchPlugin)
          : undefined
        if (!touchPlugin) {
          return windowError(PLUGIN_WINDOW_ERROR_CODES.NOT_FOUND, 'Plugin not found.')
        }

        const id = payload?.id
        if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
          return windowError(
            PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
            'A valid window id is required.'
          )
        }

        const win = touchPlugin._windows.get(id)
        const browserWindow = useAliveTarget(win?.window)
        if (!win || !browserWindow) {
          return windowError(PLUGIN_WINDOW_ERROR_CODES.NOT_FOUND, 'Window not found.')
        }

        try {
          const command = normalizePluginWindowCommand(payload.command)
          executePluginWindowCommand(browserWindow, command)
          return { success: true }
        } catch (error) {
          return { error: toPluginWindowErrorData(error) }
        }
      }
    ),

    registerProtectedWindowChannel<PluginWindowPropertyRequest, PluginWindowPropertyResponse>(
      PluginEvents.window.property,
      protectedWindowOptions,
      async (payload, requestContext) => {
        const pluginName = requestContext.plugin?.name
        const touchPlugin = pluginName
          ? (manager.plugins.get(pluginName) as TouchPlugin)
          : undefined
        if (!touchPlugin) {
          return windowError(PLUGIN_WINDOW_ERROR_CODES.NOT_FOUND, 'Plugin not found.')
        }

        const id = payload?.id
        if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
          return windowError(
            PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
            'A valid window id is required.'
          )
        }

        const win = touchPlugin._windows.get(id)
        const browserWindow = useAliveTarget(win?.window)
        if (!win || !browserWindow) {
          return windowError(PLUGIN_WINDOW_ERROR_CODES.NOT_FOUND, 'Window not found.')
        }

        try {
          const command = translateLegacyWindowProperty(payload?.property)
          executePluginWindowCommand(browserWindow, command)
          return { success: true }
        } catch (error) {
          return { error: toPluginWindowErrorData(error) }
        }
      }
    ),

    transport.on(
      PluginEvents.communicate.index,
      async (data: IndexCommunicatePayload, requestContext) => {
        try {
          const pluginName = requestContext.plugin?.name
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
      }
    )
  )

  return disposers
}
