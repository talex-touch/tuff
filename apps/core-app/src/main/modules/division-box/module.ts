/**
 * DivisionBox Module
 *
 * Main module class for DivisionBox system.
 * Handles initialization, IPC registration, and integration with other systems.
 */

import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { DivisionBoxIPC } from './ipc'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import {
  clearRegisteredMainRuntime,
  registerMainRuntime,
  resolveMainRuntime
} from '../../core/runtime-accessor'
import { BaseModule } from '../abstract-base-module'
import searchEngineCore from '../box-tool/search-engine/search-core'
import { TalexEvents } from '../../core/eventbus/touch-event'
import { createDivisionBoxCommandProvider } from './command-provider'
import { initializeDivisionBoxIPC } from './ipc'
import { divisionBoxModuleLog } from './logger'
import { shortcutTriggerManager } from './shortcut-trigger'
import { windowPool } from './window-pool'

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
  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const runtime = registerMainRuntime(
      'division-box',
      resolveMainRuntime(ctx, 'DivisionBoxModule.onInit')
    )
    const transport = getTuffTransportMain(
      runtime.channel,
      runtime.channel.keyManager ?? runtime.channel
    )

    // Initialize IPC handlers
    this.ipc = initializeDivisionBoxIPC(transport)

    // Register DivisionBox command provider with search engine
    const commandProvider = createDivisionBoxCommandProvider()
    searchEngineCore.registerProvider(commandProvider)
    await windowPool.initialize()

    divisionBoxModuleLog.info('Module initialized')
  }

  /**
   * Cleans up the DivisionBox module
   *
   * - Destroys window pool
   * - Unregisters IPC handlers
   * - Unregisters command provider
   */
  onDestroy(): MaybePromise<void> {
    clearRegisteredMainRuntime('division-box')

    shortcutTriggerManager.clear()

    // Destroy window pool
    windowPool.destroy()

    // Unregister IPC handlers
    if (this.ipc) {
      this.ipc.unregisterHandlers()
      this.ipc = null
    }

    // Unregister command provider
    searchEngineCore.unregisterProvider('division-box-commands')

    divisionBoxModuleLog.info('Module destroyed')
  }
}

/**
 * Singleton instance export
 */
export const divisionBoxModule = new DivisionBoxModule()
