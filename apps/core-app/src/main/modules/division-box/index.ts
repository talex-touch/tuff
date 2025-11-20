/**
 * DivisionBox Module - Main Process
 * 
 * Entry point for the DivisionBox system in the main process.
 * Exports all public APIs, types, and utilities.
 */

export * from '@talex-touch/utils' // Re-export shared types
export { DivisionBoxSession } from './session'
export { LRUCache } from './lru-cache'
export { DivisionBoxManager } from './manager'
export { 
  parseManifestDivisionBoxConfig, 
  mergeManifestWithRuntimeConfig,
  getDefaultManifestConfig 
} from './manifest-parser'
export { ShortcutTriggerManager, shortcutTriggerManager, type ShortcutMapping } from './shortcut-trigger'
export { DivisionBoxCommandProvider, createDivisionBoxCommandProvider } from './command-provider'
export { DivisionBoxModule, divisionBoxModule } from './module'
export { 
  FlowTriggerManager, 
  flowTriggerManager, 
  type FlowTargetConfig, 
  type FlowPayload, 
  type FlowPayloadType 
} from './flow-trigger'
