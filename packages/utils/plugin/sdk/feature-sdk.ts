/**
 * Feature SDK for Plugin Development
 *
 * Provides a unified API for plugins to manage search result items (TuffItems)
 * in the CoreBox interface. This SDK handles item lifecycle, updates, and
 * input change notifications.
 */

import type { TuffItem } from '../../core-box/tuff'
import { createPluginTuffTransport } from '../../transport'
import { CoreBoxEvents } from '../../transport/events'
import { createDisposableBag } from '../../transport/sdk'
import { useBoxItems } from './box-items'
import { ensureRendererChannel } from './channel'

/**
 * Input change event handler
 */
export type InputChangeHandler = (input: string) => void

/**
 * Keyboard event data forwarded from CoreBox
 */
export interface ForwardedKeyEvent {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
}

/**
 * Key event handler
 */
export type KeyEventHandler = (event: ForwardedKeyEvent) => void

function createRemovedKeyEventError(): Error {
  return Object.assign(
    new Error(
      '[Feature SDK] onKeyEvent was removed by the hard-cut because core-box:key-event has no production sender. Use attached UI hostKeyEvent props for plugin UI keyboard handling.'
    ),
    { code: 'plugin_feature_key_event_removed' },
  )
}

/**
 * Feature SDK interface for plugins
 *
 * @example
 * ```typescript
 * // Push items to CoreBox
 * plugin.feature.pushItems([
 *   { id: 'item-1', title: 'Result 1', ... },
 *   { id: 'item-2', title: 'Result 2', ... }
 * ])
 *
 * // Update a specific item
 * plugin.feature.updateItem('item-1', { title: 'Updated Title' })
 *
 * // Listen for input changes
 * plugin.feature.onInputChange((input) => {
 *   console.log('User typed:', input)
 * })
 * ```
 */
export interface FeatureSDK {
  /**
   * Pushes multiple items to the CoreBox search results
   *
   * @param items - Array of TuffItem objects to display
   *
   * @example
   * ```typescript
   * plugin.feature.pushItems([
   *   {
   *     id: 'calc-result',
   *     title: { text: '42' },
   *     subtitle: { text: 'Calculation result' },
   *     source: { id: 'calculator', name: 'Calculator' }
   *   }
   * ])
   * ```
   */
  pushItems: (items: TuffItem[]) => void

  /**
   * Updates a specific item by ID
   *
   * @param id - The unique ID of the item to update
   * @param updates - Partial TuffItem with fields to update
   *
   * @example
   * ```typescript
   * // Update title and subtitle
   * plugin.feature.updateItem('item-1', {
   *   title: { text: 'New Title' },
   *   subtitle: { text: 'Updated subtitle' }
   * })
   * ```
   */
  updateItem: (id: string, updates: Partial<TuffItem>) => void

  /**
   * Removes a specific item by ID
   *
   * @param id - The unique ID of the item to remove
   *
   * @example
   * ```typescript
   * plugin.feature.removeItem('item-1')
   * ```
   */
  removeItem: (id: string) => void

  /**
   * Clears all items pushed by this plugin
   *
   * @example
   * ```typescript
   * plugin.feature.clearItems()
   * ```
   */
  clearItems: () => void

  /**
   * Gets all items currently pushed by this plugin
   *
   * @returns Array of TuffItem objects
   *
   * @example
   * ```typescript
   * const items = plugin.feature.getItems()
   * console.log(`Currently showing ${items.length} items`)
   * ```
   */
  getItems: () => TuffItem[]

  /**
   * Registers a listener for input changes in the CoreBox search field
   *
   * @param handler - Callback function invoked when input changes
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = plugin.feature.onInputChange((input) => {
   *   console.log('User typed:', input)
   *   // Perform real-time search
   *   performSearch(input)
   * })
   *
   * // Later, unsubscribe
   * unsubscribe()
   * ```
   */
  onInputChange: (handler: InputChangeHandler) => () => void

  /**
   * @deprecated Removed by the hard-cut. The old `core-box:key-event` channel
   * has no production sender; handle keyboard events in the attached UI or via
   * host-provided `hostKeyEvent` props.
   *
   * Calling this method throws `plugin_feature_key_event_removed`.
   */
  onKeyEvent: (handler: KeyEventHandler) => () => void

  /**
   * 释放内部监听器，避免重复注册导致的内存泄漏
   */
  dispose: () => void
}

/**
 * Creates a Feature SDK instance for plugin use
 *
 * @param boxItemsAPI - The boxItems API object from plugin context
 * @param channel - The plugin channel bridge for IPC communication
 * @returns Configured Feature SDK instance
 *
 * @internal
 */
export function createFeatureSDK(boxItemsAPI: any, channel: any): FeatureSDK {
  const inputChangeHandlers: Set<InputChangeHandler> = new Set()
  const disposables = createDisposableBag()
  const transport = createPluginTuffTransport(channel)
  let disposed = false

  const emitInput = (payload: any) => {
    const input =
      typeof payload?.input === 'string'
        ? payload.input
        : typeof payload?.query?.text === 'string'
          ? payload.query.text
          : typeof payload === 'string'
            ? payload
            : ''
    for (const handler of inputChangeHandlers) {
      try {
        handler(input)
      }
      catch (error) {
        console.error('[Feature SDK] onInputChange handler error:', error)
      }
    }
  }

  const ensureActive = (method: string) => {
    if (disposed) {
      throw new Error(`[Feature SDK] Cannot call ${method} after dispose`)
    }
  }

  const dispose = () => {
    if (disposed) {
      return
    }

    disposed = true
    inputChangeHandlers.clear()
    disposables.dispose()
    transport.destroy()
  }

  disposables.add(
    transport.on(CoreBoxEvents.input.change, emitInput),
  )

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onBeforeUnload = () => dispose()
    window.addEventListener('beforeunload', onBeforeUnload, { once: true })
    disposables.add(() => window.removeEventListener('beforeunload', onBeforeUnload))
  }

  return {
    pushItems(items: TuffItem[]): void {
      ensureActive('pushItems')
      if (!boxItemsAPI || !boxItemsAPI.pushItems) {
        throw new Error('[Feature SDK] boxItems API not available')
      }
      boxItemsAPI.pushItems(items)
    },

    updateItem(id: string, updates: Partial<TuffItem>): void {
      ensureActive('updateItem')
      if (!boxItemsAPI || !boxItemsAPI.update) {
        throw new Error('[Feature SDK] boxItems API not available')
      }
      boxItemsAPI.update(id, updates)
    },

    removeItem(id: string): void {
      ensureActive('removeItem')
      if (!boxItemsAPI || !boxItemsAPI.remove) {
        throw new Error('[Feature SDK] boxItems API not available')
      }
      boxItemsAPI.remove(id)
    },

    clearItems(): void {
      ensureActive('clearItems')
      if (!boxItemsAPI || !boxItemsAPI.clear) {
        throw new Error('[Feature SDK] boxItems API not available')
      }
      boxItemsAPI.clear()
    },

    getItems(): TuffItem[] {
      ensureActive('getItems')
      if (!boxItemsAPI || !boxItemsAPI.getItems) {
        throw new Error('[Feature SDK] boxItems API not available')
      }
      return boxItemsAPI.getItems()
    },

    onInputChange(handler: InputChangeHandler): () => void {
      ensureActive('onInputChange')
      inputChangeHandlers.add(handler)

      return () => {
        inputChangeHandlers.delete(handler)
      }
    },

    onKeyEvent(handler: KeyEventHandler): () => void {
      void handler
      ensureActive('onKeyEvent')
      throw createRemovedKeyEventError()
    },

    dispose,
  }
}

/**
 * Hook for using Feature SDK in plugin context
 *
 * @returns Feature SDK instance
 *
 * @example
 * ```typescript
 * const feature = useFeature()
 *
 * feature.pushItems([
 *   { id: '1', title: { text: 'Item 1' }, ... }
 * ])
 * ```
 */
export function useFeature(): FeatureSDK {
  const boxItemsAPI = useBoxItems()
  const channel = ensureRendererChannel('[Feature SDK] Channel not available. Make sure this is called in a plugin context.')

  return createFeatureSDK(boxItemsAPI, channel)
}
