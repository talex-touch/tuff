/**
 * Feature SDK for Plugin Development
 *
 * Provides a unified API for plugins to manage search result items (TuffItems)
 * in the CoreBox interface. This SDK handles item lifecycle, updates, and
 * input change notifications.
 */

import type { TuffItem } from '../../core-box/tuff'
import { createPluginTuffTransport } from '../../transport'
import { defineRawEvent } from '../../transport/event/builder'
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

const featureInputChangeEvent = defineRawEvent<unknown, unknown>('core-box:input-change')
const featureKeyEvent = defineRawEvent<unknown, unknown>('core-box:key-event')

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
   * Registers a listener for keyboard events forwarded from CoreBox
   *
   * When a plugin's UI view is attached to CoreBox, certain key events
   * (Enter, Arrow keys, Meta+key combinations) are forwarded to the plugin.
   *
   * @param handler - Callback function invoked when a key event is forwarded
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = plugin.feature.onKeyEvent((event) => {
   *   if (event.key === 'Enter') {
   *     // Handle enter key
   *     submitSelection()
   *   } else if (event.key === 'ArrowDown') {
   *     // Navigate down in list
   *     selectNext()
   *   } else if (event.metaKey && event.key === 'k') {
   *     // Handle Cmd+K
   *     openSearch()
   *   }
   * })
   *
   * // Later, unsubscribe
   * unsubscribe()
   * ```
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
  const keyEventHandlers: Set<KeyEventHandler> = new Set()
  const disposables = createDisposableBag()
  const transport = createPluginTuffTransport(channel)
  let disposed = false

  const emitInput = (payload: any) => {
    const input = payload?.input || payload?.query?.text || payload || ''
    for (const handler of inputChangeHandlers) {
      try {
        handler(input)
      }
      catch (error) {
        console.error('[Feature SDK] onInputChange handler error:', error)
      }
    }
  }

  const emitKeyEvent = (payload: any) => {
    const keyEvent = payload as ForwardedKeyEvent
    if (!keyEvent) {
      return
    }

    for (const handler of keyEventHandlers) {
      try {
        handler(keyEvent)
      }
      catch (error) {
        console.error('[Feature SDK] onKeyEvent handler error:', error)
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
    keyEventHandlers.clear()
    disposables.dispose()
    transport.destroy()
  }

  disposables.add(
    transport.on(featureInputChangeEvent, emitInput),
    transport.on(featureKeyEvent, emitKeyEvent),
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
      ensureActive('onKeyEvent')
      keyEventHandlers.add(handler)

      return () => {
        keyEventHandlers.delete(handler)
      }
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
