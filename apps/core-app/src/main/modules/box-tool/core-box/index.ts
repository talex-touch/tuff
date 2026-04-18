import type { ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { CoreBoxLayoutUpdateRequest } from '@talex-touch/utils/transport/events/types'
import type { TalexEvents } from '../../../core/eventbus/touch-event'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import {
  clearRegisteredMainRuntime,
  maybeGetRegisteredMainRuntime,
  registerMainRuntime,
  resolveMainRuntime
} from '../../../core/runtime-accessor'
import { createLogger } from '../../../utils/logger'
import { devProcessManager } from '../../../utils/dev-process-manager'
import { perfMonitor } from '../../../utils/perf-monitor'
import { BaseModule } from '../../abstract-base-module'
import { shortcutModule } from '../../global-shortcon'
import { getMainConfig } from '../../storage'
import SearchEngineCore from '../search-engine/search-core'
import { searchLogger } from '../search-engine/search-logger'
import { coreBoxManager } from './manager'
import { windowManager } from './window'

const coreBoxLog = createLogger('CoreBox')
const COREBOX_MIN_HEIGHT = 64
const SEARCH_DIAGNOSTICS_BURST_DURATION_MS = 30_000
const beginnerShortcutTriggeredEvent = defineRawEvent<void, void>('beginner:shortcut-triggered')
const COREBOX_SHORTCUT_OWNER = 'module.corebox'

export { getCoreBoxWindow } from './window'

let lastScreenId: number | undefined

const getCoreBoxRuntimeOrNull = () => maybeGetRegisteredMainRuntime<TalexEvents>('core-box')

const isAppQuitting = (): boolean => getCoreBoxRuntimeOrNull()?.app.isQuitting === true

export class CoreBoxModule extends BaseModule {
  static key: symbol = Symbol.for('CoreBox')
  name: ModuleKey = CoreBoxModule.key

  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []
  private disposeLagBurstSubscription: (() => void) | null = null

  private pendingLayoutUpdate: CoreBoxLayoutUpdateRequest | null = null
  private layoutApplyTimer: NodeJS.Timeout | null = null

  constructor() {
    super(CoreBoxModule.key, {
      create: false
    })
  }

  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const runtime = registerMainRuntime('core-box', resolveMainRuntime(ctx, 'CoreBoxModule.onInit'))
    await (runtime.moduleManager ?? ctx.manager).loadModule(SearchEngineCore)
    await searchLogger.init()
    this.disposeLagBurstSubscription = perfMonitor.onSevereLagBurst((event) => {
      searchLogger.enableBurst(SEARCH_DIAGNOSTICS_BURST_DURATION_MS, 'event-loop-severe-lag')
      coreBoxLog.warn('Auto-enabled search diagnostics burst after severe event-loop lag', {
        meta: {
          lagMs: event.latestLagMs,
          thresholdMs: event.thresholdMs,
          windowMs: event.windowMs,
          cooldownMs: event.cooldownMs,
          triggerCount: event.triggerCount
        }
      })
    })

    this.transport = runtime.transport
    this.registerTransportHandlers()

    coreBoxManager.init()

    shortcutModule.registerMainShortcut(
      'core.box.toggle',
      'CommandOrControl+E',
      () => {
        // Check if initialization is complete
        try {
          const appSetting = getMainConfig(StorageList.APP_SETTING) as AppSetting
          const beginnerState = appSetting?.beginner as
            | { init: boolean; shortcutArmed?: boolean }
            | undefined
          if (!beginnerState?.init) {
            coreBoxLog.warn('Initialization not complete, CoreBox is disabled')
            // Optionally show a notification or dialog to user
            const mainWindow = getCoreBoxRuntimeOrNull()?.app.window.window
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.show()
              mainWindow.focus()
              if (beginnerState?.shortcutArmed === true && this.transport) {
                void this.transport
                  .sendToWindow(mainWindow.id, beginnerShortcutTriggeredEvent, undefined)
                  .catch((error) => {
                    coreBoxLog.warn('Failed to notify beginner shortcut event', { error })
                  })
              }
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
      },
      { enabled: true, owner: COREBOX_SHORTCUT_OWNER }
    )

    shortcutModule.registerMainShortcut(
      'core.box.aiQuickCall',
      'CommandOrControl+Shift+I',
      () => {
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
        const targetWindowId = targetWindow.id
        const transport = this.transport
        if (!transport) {
          return
        }

        setTimeout(() => {
          transport
            .sendToWindow(targetWindowId, CoreBoxEvents.input.setQuery, { value: 'ai ' })
            .catch((error) => {
              coreBoxLog.error('Failed to set AI quick call query', { error })
            })
        }, 80)
      },
      { enabled: false, owner: COREBOX_SHORTCUT_OWNER }
    )

    coreBoxLog.success('Core-box module initialized')
  }

  async onDestroy(): Promise<void> {
    shortcutModule.unregisterMainShortcut('core.box.toggle')
    shortcutModule.unregisterMainShortcut('core.box.aiQuickCall')

    if (this.disposeLagBurstSubscription) {
      this.disposeLagBurstSubscription()
      this.disposeLagBurstSubscription = null
    }

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

    searchLogger.destroy()
    coreBoxManager.destroy()
    clearRegisteredMainRuntime('core-box')
  }

  private registerTransportHandlers(): void {
    if (!this.transport) return

    this.transportDisposers.push(
      this.transport.on(CoreBoxEvents.layout.update, (payload) => {
        this.queueLayoutUpdate(payload)
      })
    )
  }

  private queueLayoutUpdate(payload: CoreBoxLayoutUpdateRequest): void {
    this.pendingLayoutUpdate = payload

    if (this.layoutApplyTimer) return

    this.layoutApplyTimer = setTimeout(() => {
      this.layoutApplyTimer = null
      const next = this.pendingLayoutUpdate
      this.pendingLayoutUpdate = null
      if (!next) return
      this.applyLayoutUpdate(next)
    }, 16)
  }

  private shouldLogLayout(): boolean {
    try {
      const appSetting = getMainConfig(StorageList.APP_SETTING) as AppSetting
      return appSetting?.searchEngine?.logsEnabled || appSetting?.diagnostics?.verboseLogs
    } catch {
      return false
    }
  }

  private applyLayoutUpdate(payload: CoreBoxLayoutUpdateRequest): void {
    const logEnabled = this.shouldLogLayout()
    if (isAppQuitting() || devProcessManager.isShuttingDownProcess()) {
      if (logEnabled) {
        coreBoxLog.info('Layout update skipped (application is quitting)')
      }
      return
    }

    if (coreBoxManager.isUIMode) {
      if (logEnabled) {
        coreBoxLog.info('Layout update skipped (UI mode active)', {
          meta: {
            height: Number(payload.height),
            resultCount: Number(payload.resultCount),
            loading: payload.loading === true,
            recommendationPending: payload.recommendationPending === true,
            activationCount: Number(payload.activationCount),
            source: String(payload.source ?? '')
          }
        })
      }
      return
    }

    const currentWindow = windowManager.current?.window
    if (!currentWindow || currentWindow.isDestroyed()) {
      if (logEnabled) {
        coreBoxLog.info('Layout update skipped (no window)', {
          meta: {
            height: Number(payload.height),
            resultCount: Number(payload.resultCount),
            loading: payload.loading === true,
            recommendationPending: payload.recommendationPending === true,
            activationCount: Number(payload.activationCount),
            source: String(payload.source ?? '')
          }
        })
      }
      return
    }

    const activationCount = Number.isFinite(payload.activationCount)
      ? Math.max(0, payload.activationCount)
      : 0
    const resultCount = Number.isFinite(payload.resultCount) ? Math.max(0, payload.resultCount) : 0
    const loading = payload.loading === true
    const recommendationPending = payload.recommendationPending === true
    const forceMax = payload.forceMax === true

    if (logEnabled) {
      coreBoxLog.info('Layout update received', {
        meta: {
          height: Number(payload.height),
          resultCount,
          activationCount,
          loading,
          recommendationPending,
          forceMax,
          source: String(payload.source ?? '')
        }
      })
    }

    if (forceMax) {
      if (logEnabled) {
        coreBoxLog.info('Layout update: expand (force max)', {
          meta: {
            activationCount,
            resultCount
          }
        })
      }
      coreBoxManager.expand({ forceMax: true })
      return
    }

    if (activationCount > 0 && resultCount > 0) {
      if (logEnabled) {
        coreBoxLog.info('Layout update: expand (activation + results)', {
          meta: {
            activationCount,
            resultCount
          }
        })
      }
      coreBoxManager.expand({ forceMax: true })
      return
    }

    const shouldCollapse = resultCount === 0 && !loading && !recommendationPending
    if (shouldCollapse) {
      if (logEnabled) {
        coreBoxLog.info('Layout update: shrink (empty, idle)', {
          meta: {
            resultCount,
            loading,
            recommendationPending
          }
        })
      }
      coreBoxManager.shrink()
      return
    }

    // When waiting for data (loading/recommendation), keep current window size stable.
    // This avoids collapse-then-expand jitter while results are still pending.
    if (resultCount === 0 && (loading || recommendationPending)) {
      if (logEnabled) {
        coreBoxLog.info('Layout update: skip (pending)', {
          meta: {
            loading,
            recommendationPending
          }
        })
      }
      return
    }

    const safeHeight = Math.max(
      COREBOX_MIN_HEIGHT,
      Math.min(Number(payload.height) || COREBOX_MIN_HEIGHT, 600)
    )

    // Guard: if UI has results but height measurement isn't ready, skip this update.
    if (resultCount > 0 && safeHeight <= COREBOX_MIN_HEIGHT) {
      if (logEnabled) {
        coreBoxLog.info('Layout update: skip (height not ready)', {
          meta: {
            safeHeight,
            resultCount
          }
        })
      }
      return
    }

    if (safeHeight > COREBOX_MIN_HEIGHT && coreBoxManager.isCollapsed) {
      coreBoxManager.markExpanded()
    }

    windowManager.setHeight(safeHeight)
    if (logEnabled) {
      coreBoxLog.info('Layout update: setHeight', {
        meta: {
          safeHeight
        }
      })
    }
  }
}

const coreBoxModule = new CoreBoxModule()

export { coreBoxModule }
