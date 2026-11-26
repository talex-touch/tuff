import type { App, InjectionKey } from 'vue'
import {
  DEFAULT_Z_INDEX_SEED,
  configureZIndex,
  createZIndexAllocator,
  getDefaultZIndexAllocator,
  getZIndex,
  isTopmostModalDialog,
  nextZIndex,
  onZIndexEvent,
  refreshZIndex,
  resetZIndex,
  type TxZIndexAllocator,
  type TxZIndexContext,
  type TxZIndexEvent,
  type TxZIndexOverrides,
  type TxZIndexSeedSource,
} from '@talex-touch/tuffex-core'
import { getCurrentInstance, inject } from 'vue'

export {
  DEFAULT_Z_INDEX_SEED,
  configureZIndex,
  createZIndexAllocator,
  getZIndex,
  isTopmostModalDialog,
  nextZIndex,
  onZIndexEvent,
  refreshZIndex,
  resetZIndex,
  type TxZIndexAllocator,
  type TxZIndexContext,
  type TxZIndexEvent,
  type TxZIndexOverrides,
  type TxZIndexSeedSource,
}

export const TX_Z_INDEX_ALLOCATOR_KEY: InjectionKey<TxZIndexAllocator>
  = Symbol('tx-z-index-allocator')

/**
 * Gives one app its own allocator. Vue SSR builds an app per request, so this
 * is what makes the counter request-scoped on the server.
 */
export function provideZIndexAllocator(
  app: App,
  allocator: TxZIndexAllocator = createZIndexAllocator(),
): TxZIndexAllocator {
  app.provide(TX_Z_INDEX_ALLOCATOR_KEY, allocator)
  return allocator
}

/**
 * Resolves the app-scoped allocator, falling back to the module-level one when
 * no app provided it — so a component still works when mounted outside
 * `app.use(Tuffex)`.
 */
export function useZIndexAllocator(): TxZIndexAllocator {
  const fallback = getDefaultZIndexAllocator()
  if (!getCurrentInstance())
    return fallback
  return inject(TX_Z_INDEX_ALLOCATOR_KEY, fallback)
}
