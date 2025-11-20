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
