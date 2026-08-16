/**
 * Tuff plugin type definitions.
 * Imports core types from @talex-touch/utils.
 */

// Import types from @talex-touch/utils
export type {
  IPluginFeature,
  IPluginLifecycle,
  IPluginUtils,
  ISearchManager,
  IStorageManager,
  ITuffIcon,
} from '@talex-touch/utils'

// Re-export types for use in JSDoc
export type { IPluginLifecycle as PluginLifecycle } from '@talex-touch/utils'

declare global {
  // eslint-disable-next-line vars-on-top
  var $util: import('@talex-touch/utils').IPluginUtils
  // eslint-disable-next-line vars-on-top
  var TuffItemBuilder: new (id: string) => any

  interface Window {
    $util: import('@talex-touch/utils').IPluginUtils
    TuffItemBuilder: new (id: string) => any
  }
}
