/**
 * DivisionBox Module
 * 
 * Main module class for DivisionBox system.
 * Handles initialization, IPC registration, and integration with other systems.
 */

import type { MaybePromise, ModuleKey } from '@talex-touch/utils'
import type { ITouchChannel } from '@talex-touch/utils/channel'
import { BaseModule } from '../abstract-base-module'
import { DivisionBoxIPC, initializeDivisionBoxIPC } from './ipc'
import { createDivisionBoxCommandProvider } from './command-provider'
import searchEngineCore from '../box-tool/search-engine/search-core'

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
  async onInit(): Promise<void> {
    // Get the channel from the app
    const channel: ITouchChannel = $app.channel
    
    // Initialize IPC handlers
    this.ipc = initializeDivisionBoxIPC(channel)
    
    // Register DivisionBox command provider with search engine
    const commandProvider = createDivisionBoxCommandProvider()
    searchEngineCore.registerProvider(commandProvider)
    
    console.log('[DivisionBoxModule] Module initialized')
  }
  
  /**
   * Cleans up the DivisionBox module
   * 
   * - Unregisters IPC handlers
   * - Unregisters command provider
   */
  onDestroy(): MaybePromise<void> {
    // Unregister IPC handlers
    if (this.ipc) {
      this.ipc.unregisterHandlers()
      this.ipc = null
    }
    
    // Unregister command provider
    searchEngineCore.unregisterProvider('division-box-commands')
    
    console.log('[DivisionBoxModule] Module destroyed')
  }
}

/**
 * Singleton instance export
 */
export const divisionBoxModule = new DivisionBoxModule()

