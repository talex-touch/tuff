import type { ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { ITuffTransportMain } from '@talex-touch/utils/transport'
import type { CoreBoxLayoutUpdateRequest } from '@talex-touch/utils/transport/events/types'
import { ChannelType } from '@talex-touch/utils/channel'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { genTouchApp } from '../../../core'
import type { TalexEvents } from '../../../core/eventbus/touch-event'
import { BaseModule } from '../../abstract-base-module'
import { shortcutModule } from '../../global-shortcon'
import { getConfig } from '../../storage'
import { createLogger } from '../../../utils/logger'
import SearchEngineCore from '../search-engine/search-core'
import { coreBoxManager } from './manager'
import { windowManager } from './window'

const coreBoxLog = createLogger('CoreBox')

export { getCoreBoxWindow } from './window'

let lastScreenId: number | undefined

export class CoreBoxModule extends BaseModule {
  static key: symbol = Symbol.for('CoreBox')
  name: ModuleKey = CoreBoxModule.key

  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []

  private pendingLayoutUpdate: CoreBoxLayoutUpdateRequest | null = null
  private layoutApplyTimer: NodeJS.Timeout | null = null

  constructor() {
    super(CoreBoxModule.key, {
      create: false
    })
  }

  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    await $app.moduleManager.loadModule(SearchEngineCore)

    const channel = (ctx.app as any).channel as any
    this.transport = getTuffTransportMain(
      channel,
      channel?.keyManager ?? channel,
    )
    this.registerTransportHandlers()

    coreBoxManager.init()

    shortcutModule.registerMainShortcut('core.box.toggle', 'CommandOrControl+E', () => {
      // Check if initialization is complete
      try {
        const appSetting = getConfig(StorageList.APP_SETTING) as any
        if (!appSetting?.beginner?.init) {
          coreBoxLog.warn('Initialization not complete, CoreBox is disabled')
          // Optionally show a notification or dialog to user
          const mainWindow = $app.window.window
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show()
            mainWindow.focus()
          }
          return
        }
      } catch (error) {
        coreBoxLog.error('Failed to check initialization status', { error })
        // If we can't check, allow CoreBox to open (fail-open approach)
      }

      const curScreen = windowManager.getCurScreen()

      if (coreBoxManager.showCoreBox) {
        if (lastScreenId === curScreen.id) {
          coreBoxManager.trigger(false)
        } else {
          const currentWindow = windowManager.current
          if (currentWindow) {
            windowManager.updatePosition(currentWindow, curScreen)
            lastScreenId = curScreen.id
          } else {
            coreBoxLog.error('No current window available')
          }
        }
      } else {
        // Pass triggeredByShortcut flag when opening CoreBox via shortcut
        coreBoxManager.trigger(true, { triggeredByShortcut: true })
        lastScreenId = curScreen.id
      }
    })

    shortcutModule.registerMainShortcut('core.box.aiQuickCall', 'CommandOrControl+Shift+I', () => {
      const touchApp = genTouchApp()
      const curScreen = windowManager.getCurScreen()
      const currentWindow = windowManager.current

      if (currentWindow) {
        windowManager.updatePosition(currentWindow, curScreen)
      }

      // Also pass triggeredByShortcut for AI quick call
      coreBoxManager.trigger(true, { triggeredByShortcut: true })
      lastScreenId = curScreen.id

      const targetWindow = windowManager.current?.window
      if (!targetWindow || targetWindow.isDestroyed()) {
        return
      }

      setTimeout(() => {
        touchApp.channel
          .sendTo(targetWindow, ChannelType.MAIN, 'core-box:set-query', { value: 'ai ' })
          .catch((error) => {
            coreBoxLog.error('Failed to set AI quick call query', { error })
          })
      }, 80)
    })

    coreBoxLog.success('Core-box module initialized')
  }

  async onDestroy(): Promise<void> {
    if (this.layoutApplyTimer) {
      clearTimeout(this.layoutApplyTimer)
      this.layoutApplyTimer = null
    }

    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.transportDisposers = []
    this.transport = null

    coreBoxManager.destroy()
  }

  private registerTransportHandlers(): void {
    if (!this.transport)
      return

    this.transportDisposers.push(
      this.transport.on(CoreBoxEvents.layout.update, (payload) => {
        this.queueLayoutUpdate(payload)
      }),
    )
  }

  private queueLayoutUpdate(payload: CoreBoxLayoutUpdateRequest): void {
    this.pendingLayoutUpdate = payload

    if (this.layoutApplyTimer)
      return

    this.layoutApplyTimer = setTimeout(() => {
      this.layoutApplyTimer = null
      const next = this.pendingLayoutUpdate
      this.pendingLayoutUpdate = null
      if (!next)
        return
      this.applyLayoutUpdate(next)
    }, 16)
  }

  private applyLayoutUpdate(payload: CoreBoxLayoutUpdateRequest): void {
    if (coreBoxManager.isUIMode)
      return

    const currentWindow = windowManager.current?.window
    if (!currentWindow || currentWindow.isDestroyed() || !currentWindow.isVisible())
      return

    const activationCount = Number.isFinite(payload.activationCount)
      ? Math.max(0, payload.activationCount)
      : 0

    if (activationCount > 0) {
      coreBoxManager.expand({ forceMax: true })
      return
    }

    const resultCount = Number.isFinite(payload.resultCount)
      ? Math.max(0, payload.resultCount)
      : 0

    const loading = payload.loading === true
    const recommendationPending = payload.recommendationPending === true

    const shouldCollapse = resultCount === 0 && !loading && !recommendationPending
    if (shouldCollapse) {
      coreBoxManager.shrink()
      return
    }

    // When waiting for data (loading/recommendation), keep current window size stable.
    // This avoids collapse-then-expand jitter while results are still pending.
    if (resultCount === 0 && (loading || recommendationPending)) {
      return
    }

    const safeHeight = Math.max(60, Math.min(Number(payload.height) || 60, 600))

    // Guard: if UI has results but height measurement isn't ready, skip this update.
    if (resultCount > 0 && safeHeight <= 60)
      return

    if (safeHeight > 60 && coreBoxManager.isCollapsed) {
      coreBoxManager.markExpanded()
    }

    windowManager.setHeight(safeHeight)
  }
}

const coreBoxModule = new CoreBoxModule()

export { coreBoxModule }
