/**
 * DivisionBox Module - Main Process
 *
 * Entry point for the DivisionBox system in the main process.
 * Exports all public APIs, types, and utilities.
 */

export { createDivisionBoxCommandProvider, DivisionBoxCommandProvider } from './command-provider'
export {
  type FlowPayload,
  type FlowPayloadType,
  type FlowTargetConfig,
  FlowTriggerManager,
  flowTriggerManager
} from './flow-trigger'
export { LRUCache } from './lru-cache'
export { DivisionBoxManager } from './manager'
export {
  getDefaultManifestConfig,
  mergeManifestWithRuntimeConfig,
  parseManifestDivisionBoxConfig
} from './manifest-parser'
export { DivisionBoxModule, divisionBoxModule } from './module'
export { DivisionBoxSession } from './session'
export {
  type ShortcutMapping,
  ShortcutTriggerManager,
  shortcutTriggerManager
} from './shortcut-trigger'
export { DivisionBoxWindowPool, windowPool } from './window-pool'
export * from '@talex-touch/utils' // Re-export shared types
