import type { TuffItem } from '@talex-touch/utils/core-box/tuff/tuff-dsl'
import type { ITuffTransportMain } from '@talex-touch/utils/transport'
import type {
  ActivationState,
  AllowClipboardRequest,
  DeactivateProviderRequest,
  EnterUIModeRequest,
  ExpandOptions,
  GetProviderDetailsRequest,
  ProviderDetail,
  SetInputRequest,
  SetInputVisibilityRequest
} from '@talex-touch/utils/transport/events/types'
import type {
  MetaAction,
  MetaActionExecuteRequest,
  MetaShowRequest
} from '@talex-touch/utils/transport/events/types/meta-overlay'
import type { TouchApp } from '../../../core/touch-app'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { genTouchApp } from '../../../core'
import { createLogger } from '../../../utils/logger'
import { pluginModule } from '../../plugin/plugin-module'
import { getBoxItemManager } from '../item-sdk'
import searchEngineCore from '../search-engine/search-core'
import { searchLogger } from '../search-engine/search-logger'
import { coreBoxInputTransport } from './input-transport'
import { coreBoxKeyTransport } from './key-transport'
import { coreBoxManager } from './manager'
import { metaOverlayManager } from './meta-overlay'
import { getCoreBoxWindow, windowManager } from './window'

const metaOverlayIpcLog = createLogger('CoreBox').child('MetaOverlayIpc')
const resolveKeyManager = (channel: unknown): unknown =>
  (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
const coreBoxHideInputEvent = defineRawEvent<void, { hidden: boolean }>('core-box:hide-input')
const coreBoxShowInputEvent = defineRawEvent<void, { shown: boolean }>('core-box:show-input')
const coreBoxAllowInputEvent = defineRawEvent<void, { enabled: boolean }>('core-box:allow-input')
const coreBoxSetHeightEvent = defineRawEvent<{ height: number }, { height: number }>(
  'core-box:set-height'
)
const coreBoxGetBoundsEvent = defineRawEvent<void, { bounds: Electron.Rectangle }>(
  'core-box:get-bounds'
)
const coreBoxSetPositionOffsetEvent = defineRawEvent<
  { topPercent?: number },
  { topPercent?: number }
>('core-box:set-position-offset')

/**
 * @class IpcManager
 * @description
 * 集中处理所有与 CoreBox 相关的 IPC 通信。
 */
export class IpcManager {
  private static instance: IpcManager
  private _touchApp: TouchApp | null = null
  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []
  private transportHandlersRegistered = false

  private get touchApp(): TouchApp {
    if (!this._touchApp) {
      this._touchApp = genTouchApp()
    }
    return this._touchApp
  }

  private constructor() {
    //
  }

  private ensureTransport(): ITuffTransportMain {
    if (!this.transport) {
      const channel = this.touchApp.channel
      this.transport = getTuffTransportMain(channel, resolveKeyManager(channel))
    }
    return this.transport
  }

  private async sendInputValueToRenderer(value: string): Promise<void> {
    const coreBoxWindow = getCoreBoxWindow()
    if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
      throw new Error('CoreBox window not available')
    }

    const transport = this.ensureTransport()
    await transport.sendTo(coreBoxWindow.window.webContents, CoreBoxEvents.input.setQuery, {
      value
    })
  }

  private handleExpandRequest(data: ExpandOptions | number): void {
    if (typeof data === 'object' && data) {
      if ((data as ExpandOptions).mode === 'collapse') {
        if (coreBoxManager.isUIMode) {
          return
        }
        coreBoxManager.shrink()
        return
      }

      const currentWindow = windowManager.current?.window
      if (!currentWindow || currentWindow.isDestroyed() || !currentWindow.isVisible()) {
        return
      }

      if ((data as ExpandOptions).mode === 'max') {
        coreBoxManager.expand({ forceMax: true })
        return
      }

      if (typeof (data as ExpandOptions).length === 'number') {
        coreBoxManager.expand({ length: (data as ExpandOptions).length })
        return
      }
    }

    if (typeof data === 'number' && data > 0) {
      const currentWindow = windowManager.current?.window
      if (!currentWindow || currentWindow.isDestroyed() || !currentWindow.isVisible()) {
        return
      }
      coreBoxManager.expand({ length: data })
    } else {
      coreBoxManager.shrink()
    }
  }

  private async requestInputValue(): Promise<string> {
    const coreBoxWindow = getCoreBoxWindow()
    if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
      throw new Error('CoreBox window not available')
    }

    const transport = this.ensureTransport()
    const result = await transport.sendTo(
      coreBoxWindow.window.webContents,
      CoreBoxEvents.input.requestValue,
      undefined
    )
    return result?.input || ''
  }

  private async setInputVisibility(visible: boolean): Promise<void> {
    const coreBoxWindow = getCoreBoxWindow()
    if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
      throw new Error('CoreBox window not available')
    }

    const transport = this.ensureTransport()
    await transport.sendTo(coreBoxWindow.window.webContents, CoreBoxEvents.input.setVisibility, {
      visible
    })
  }

  public static getInstance(): IpcManager {
    if (!IpcManager.instance) {
      IpcManager.instance = new IpcManager()
    }
    return IpcManager.instance
  }

  public register(): void {
    this.registerTransportHandlers()
    coreBoxInputTransport.register()
    coreBoxKeyTransport.register()
  }

  public unregister(): void {
    // In a real scenario, we might want to unregister specific channels
    // For now, we don't have a clean way to do this with the current channel implementation
    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.transportDisposers = []
    this.transport = null
    this.transportHandlersRegistered = false
  }

  private registerTransportHandlers(): void {
    if (this.transportHandlersRegistered) {
      return
    }

    const transport = this.ensureTransport()
    this.transportHandlersRegistered = true

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.ui.show, () => {
        coreBoxManager.trigger(true)
      })
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.ui.hide, () => {
        coreBoxManager.trigger(false)
      })
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.ui.expand, (payload) => {
        this.handleExpandRequest(payload as ExpandOptions | number)
      })
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.ui.focusWindow, () => {
        const window = getCoreBoxWindow()
        if (window && !window.window.isDestroyed()) {
          window.window.focus()
        }
        return { focused: true }
      })
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.search.query, async ({ query }) => {
        if (searchLogger.isEnabled()) {
          searchLogger.logSearchPhase(
            'IPC Query',
            `Text: "${query?.text ?? ''}", Inputs: ${query?.inputs?.length ?? 0}`
          )
        }
        return await coreBoxManager.search(query)
      })
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.search.cancel, ({ searchId }) => {
        if (searchId && searchEngineCore.getCurrentGatherController()) {
          searchEngineCore.cancelSearch(searchId)
          return { cancelled: true }
        }
        return { cancelled: false }
      })
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.input.get, async () => {
        const input = await this.requestInputValue()
        return { input }
      })
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.input.set, async (request: SetInputRequest) => {
        const value = typeof request?.value === 'string' ? request.value : ''
        await this.sendInputValueToRenderer(value)
        return { value }
      })
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.input.clear, async () => {
        await this.sendInputValueToRenderer('')
        return { cleared: true }
      })
    )

    this.transportDisposers.push(
      transport.on(
        CoreBoxEvents.input.setVisibility,
        async (request: SetInputVisibilityRequest) => {
          await this.setInputVisibility(Boolean(request?.visible))
        }
      )
    )

    this.transportDisposers.push(
      transport.on(
        CoreBoxEvents.provider.deactivate,
        async (request: DeactivateProviderRequest) => {
          const { id } = request
          if (id?.startsWith('plugin-features:')) {
            const pluginName = id.substring('plugin-features:'.length)
            const boxItemManager = getBoxItemManager()
            boxItemManager.clear(pluginName)
          }

          searchEngineCore.deactivateProvider(id)
          const activeProviders = (searchEngineCore.getActivationState() ?? [])
            .map((activation) => {
              if (activation?.id === 'plugin-features' && activation?.meta?.pluginName) {
                return `${activation.id}:${activation.meta.pluginName}`
              }
              return String(activation?.id ?? '')
            })
            .filter(Boolean)

          return { activeProviders } satisfies ActivationState
        }
      )
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.provider.deactivateAll, async () => {
        const boxItemManager = getBoxItemManager()
        boxItemManager.clear()
        searchEngineCore.deactivateProviders()
        return { activeProviders: [] } satisfies ActivationState
      })
    )

    this.transportDisposers.push(
      transport.on(
        CoreBoxEvents.provider.getDetails,
        async (request: GetProviderDetailsRequest) => {
          const { providerIds } = request
          if (!providerIds || providerIds.length === 0) {
            return []
          }

          const nativeProviders = searchEngineCore.getProvidersByIds(providerIds)
          const nativeProviderDetails: ProviderDetail[] = nativeProviders.map((p) => ({
            id: p.id,
            name: p.name ?? p.id,
            icon: p.icon
          }))

          const nativeProviderIds = new Set(nativeProviders.map((p) => p.id))
          const pluginIdsToFetch = providerIds.filter((id) => !nativeProviderIds.has(id))

          const pluginDetails: ProviderDetail[] = pluginIdsToFetch
            .map((id): ProviderDetail | null => {
              const plugin = pluginModule.pluginManager!.plugins.get(id)
              if (!plugin) return null
              return {
                id: plugin.name,
                name: plugin.name,
                icon: plugin.icon
              }
            })
            .filter((p): p is ProviderDetail => p !== null)

          return [...nativeProviderDetails, ...pluginDetails]
        }
      )
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.uiMode.enter, (request: EnterUIModeRequest) => {
        const { url } = request
        if (url) {
          coreBoxManager.enterUIMode(url)
        }
      })
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.uiMode.exit, () => {
        coreBoxManager.exitUIMode()
      })
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.clipboard.allow, (request: AllowClipboardRequest) => {
        const types = request?.types ?? 0
        windowManager.enableClipboardMonitoring(types)
        return { enabled: true, types }
      })
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.inputMonitoring.allow, () => {
        windowManager.enableInputMonitoring()
        return { enabled: true }
      })
    )

    this.transportDisposers.push(
      transport.on(coreBoxHideInputEvent, async () => {
        await this.setInputVisibility(false)
        return { hidden: true }
      })
    )

    this.transportDisposers.push(
      transport.on(coreBoxShowInputEvent, async () => {
        await this.setInputVisibility(true)
        return { shown: true }
      })
    )

    this.transportDisposers.push(
      transport.on(coreBoxAllowInputEvent, () => {
        windowManager.enableInputMonitoring()
        return { enabled: true }
      })
    )

    this.transportDisposers.push(
      transport.on(coreBoxSetHeightEvent, (payload) => {
        const { height } = payload
        if (typeof height !== 'number' || height < 60 || height > 650) {
          throw new Error('Invalid height (must be 60-650)')
        }

        if (height > 60 && coreBoxManager.isCollapsed) {
          coreBoxManager.markExpanded()
        }

        windowManager.setHeight(height)
        return { height }
      })
    )

    this.transportDisposers.push(
      transport.on(coreBoxGetBoundsEvent, () => {
        const win = windowManager.current?.window
        if (!win || win.isDestroyed()) {
          throw new Error('No window available')
        }
        return { bounds: win.getBounds() }
      })
    )

    this.transportDisposers.push(
      transport.on(coreBoxSetPositionOffsetEvent, (payload) => {
        const { topPercent } = payload
        if (typeof topPercent === 'number') {
          windowManager.setPositionOffset(topPercent)
        }
        return { topPercent }
      })
    )

    this.transportDisposers.push(
      transport.on(MetaOverlayEvents.ui.show, (request: MetaShowRequest) => {
        metaOverlayIpcLog.info('ui.show received', {
          meta: {
            hasItem: Boolean(request.item),
            builtinActions: request.builtinActions?.length ?? 0,
            itemActions: request.itemActions?.length ?? 0
          }
        })
        const pluginActions = metaOverlayManager.getPluginActions()
        request.pluginActions = pluginActions
        metaOverlayManager.show(request)
      })
    )

    this.transportDisposers.push(
      transport.on(MetaOverlayEvents.ui.hide, () => {
        metaOverlayIpcLog.info('ui.hide received')
        metaOverlayManager.hide()
      })
    )

    this.transportDisposers.push(
      transport.on(MetaOverlayEvents.ui.isVisible, () => {
        const visible = metaOverlayManager.getVisible()
        metaOverlayIpcLog.debug('ui.isVisible received', { meta: { visible } })
        return { visible }
      })
    )

    this.transportDisposers.push(
      transport.on(MetaOverlayEvents.action.execute, async (request) => {
        const payload = request as MetaActionExecuteRequest & { item?: TuffItem }
        const item = payload.item
        if (!item) {
          throw new Error('Item not found')
        }
        await metaOverlayManager.executeAction(payload.actionId, item)
        return { success: true }
      })
    )

    this.transportDisposers.push(
      transport.on(MetaOverlayEvents.action.register, (payload) => {
        const { pluginId, action } = payload as { pluginId: string; action: MetaAction }
        metaOverlayManager.registerPluginAction(pluginId, action)
      })
    )

    this.transportDisposers.push(
      transport.on(MetaOverlayEvents.action.unregister, (payload) => {
        const { pluginId, actionId } = payload as { pluginId: string; actionId?: string }
        if (actionId) {
          metaOverlayManager.unregisterPluginAction(pluginId, actionId)
        } else {
          metaOverlayManager.unregisterPluginActions(pluginId)
        }
      })
    )
  }
}

export const ipcManager = IpcManager.getInstance()
