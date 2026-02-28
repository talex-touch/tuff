/**
 * DivisionBox Module
 *
 * Main module class for DivisionBox system.
 * Handles initialization, IPC registration, and integration with other systems.
 */

import type { MaybePromise, ModuleKey, ModuleStartContext } from '@talex-touch/utils'
import type { DivisionBoxIPC } from './ipc'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import type { BrowserWindow } from 'electron'
import { BaseModule } from '../abstract-base-module'
import searchEngineCore from '../box-tool/search-engine/search-core'
import { TalexEvents } from '../../core/eventbus/touch-event'
import { createDivisionBoxCommandProvider } from './command-provider'
import { initializeDivisionBoxIPC } from './ipc'
import { windowPool } from './window-pool'

const LOG_PREFIX = '[DivisionBox]'
const MAIN_RENDERER_READY_TIMEOUT_MS = 30_000

/**
 * DivisionBoxModule
 *
 * Manages the lifecycle of the DivisionBox system.
 * Registers IPC handlers, command providers, and integrates with CoreBox.
 */
export class DivisionBoxModule extends BaseModule {
  static key: symbol = Symbol.for('DivisionBox')
  name: ModuleKey = DivisionBoxModule.key

  private ipc: DivisionBoxIPC | null = null
  private disposeAllModulesLoaded: (() => void) | null = null

  constructor() {
    super(DivisionBoxModule.key, {
      create: false
    })
  }

  /**
   * Initializes the DivisionBox module
   *
   * - Registers IPC handlers
   * - Registers command provider with CoreBox search engine
   */
  async onInit(): Promise<void> {
    const channel = $app.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const transport = getTuffTransportMain(channel, keyManager)

    // Initialize IPC handlers
    this.ipc = initializeDivisionBoxIPC(transport)

    // Register DivisionBox command provider with search engine
    const commandProvider = createDivisionBoxCommandProvider()
    searchEngineCore.registerProvider(commandProvider)

    console.log(LOG_PREFIX, '✓ Module initialized')
  }

  private async waitForMainRendererReady(): Promise<void> {
    const mainWindow = ($app as { window?: { window?: BrowserWindow } }).window?.window
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    const webContents = mainWindow.webContents
    if (!webContents || webContents.isDestroyed()) {
      return
    }

    if (!webContents.isLoadingMainFrame()) {
      return
    }

    await new Promise<void>((resolve) => {
      let settled = false
      let timeout: NodeJS.Timeout | null = setTimeout(() => {
        timeout = null
        finish()
      }, MAIN_RENDERER_READY_TIMEOUT_MS)

      const finish = (): void => {
        if (settled) return
        settled = true
        if (timeout) {
          clearTimeout(timeout)
          timeout = null
        }
        webContents.removeListener('did-finish-load', finish)
        webContents.removeListener('did-fail-load', finish)
        webContents.removeListener('render-process-gone', finish)
        resolve()
      }

      webContents.once('did-finish-load', finish)
      webContents.once('did-fail-load', finish)
      webContents.once('render-process-gone', finish)
    })
  }

  /**
   * Starts the DivisionBox module after all modules are loaded
   *
   * - Initializes window pool for fast detach (delayed to ensure dev server is ready)
   */
  start(ctx: ModuleStartContext<TalexEvents>): void {
    const schedulePoolInit = (): void => {
      setTimeout(() => {
        void this.waitForMainRendererReady().then(() => windowPool.initialize())
      }, 0)
    }

    const events = ctx.events
    if (!events) {
      schedulePoolInit()
      console.warn(LOG_PREFIX, 'Event bus missing, window pool scheduled immediately')
      return
    }

    const handleAllModulesLoaded = () => {
      if (this.disposeAllModulesLoaded) {
        this.disposeAllModulesLoaded()
        this.disposeAllModulesLoaded = null
      }
      schedulePoolInit()
    }

    events.on(TalexEvents.ALL_MODULES_LOADED, handleAllModulesLoaded)
    this.disposeAllModulesLoaded = () =>
      events.off(TalexEvents.ALL_MODULES_LOADED, handleAllModulesLoaded)
    console.log(LOG_PREFIX, '✓ Window pool deferred until all modules loaded')
  }

  /**
   * Cleans up the DivisionBox module
   *
   * - Destroys window pool
   * - Unregisters IPC handlers
   * - Unregisters command provider
   */
  onDestroy(): MaybePromise<void> {
    if (this.disposeAllModulesLoaded) {
      this.disposeAllModulesLoaded()
      this.disposeAllModulesLoaded = null
    }

    // Destroy window pool
    windowPool.destroy()

    // Unregister IPC handlers
    if (this.ipc) {
      this.ipc.unregisterHandlers()
      this.ipc = null
    }

    // Unregister command provider
    searchEngineCore.unregisterProvider('division-box-commands')

    console.log(LOG_PREFIX, 'Module destroyed')
  }
}

/**
 * Singleton instance export
 */
export const divisionBoxModule = new DivisionBoxModule()
