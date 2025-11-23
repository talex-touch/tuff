/**
 * Feature SDK for Plugin Development
 * 
 * Provides a unified API for plugins to manage search result items (TuffItems)
 * in the CoreBox interface. This SDK handles item lifecycle, updates, and
 * input change notifications.
 */

import type { TuffItem } from '../../core-box/tuff'

/**
 * Input change event handler
 */
export type InputChangeHandler = (input: string) => void

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
  pushItems(items: TuffItem[]): void

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
  updateItem(id: string, updates: Partial<TuffItem>): void

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
  removeItem(id: string): void

  /**
   * Clears all items pushed by this plugin
   * 
   * @example
   * ```typescript
   * plugin.feature.clearItems()
   * ```
   */
  clearItems(): void

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
  getItems(): TuffItem[]

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
  onInputChange(handler: InputChangeHandler): () => void
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

  // Register listener for input change events from main process
  const registerListener = () => {
    if (channel.onMain) {
      // Main process plugin context
      channel.onMain('core-box:input-changed', (event: any) => {
        const input = event.data?.input || event.input || ''
        inputChangeHandlers.forEach(handler => handler(input))
      })
    } else if (channel.on) {
      // Renderer process context
      channel.on('core-box:input-changed', (data: any) => {
        const input = data?.input || data || ''
        inputChangeHandlers.forEach(handler => handler(input))
      })
    }
  }

  registerListener()

  return {
    pushItems(items: TuffItem[]): void {
      if (!boxItemsAPI || !boxItemsAPI.pushItems) {
        throw new Error('[Feature SDK] boxItems API not available')
      }
      boxItemsAPI.pushItems(items)
    },

    updateItem(id: string, updates: Partial<TuffItem>): void {
      if (!boxItemsAPI || !boxItemsAPI.update) {
        throw new Error('[Feature SDK] boxItems API not available')
      }
      boxItemsAPI.update(id, updates)
    },

    removeItem(id: string): void {
      if (!boxItemsAPI || !boxItemsAPI.remove) {
        throw new Error('[Feature SDK] boxItems API not available')
      }
      boxItemsAPI.remove(id)
    },

    clearItems(): void {
      if (!boxItemsAPI || !boxItemsAPI.clear) {
        throw new Error('[Feature SDK] boxItems API not available')
      }
      boxItemsAPI.clear()
    },

    getItems(): TuffItem[] {
      if (!boxItemsAPI || !boxItemsAPI.getItems) {
        throw new Error('[Feature SDK] boxItems API not available')
      }
      return boxItemsAPI.getItems()
    },

    onInputChange(handler: InputChangeHandler): () => void {
      inputChangeHandlers.add(handler)
      
      return () => {
        inputChangeHandlers.delete(handler)
      }
    }
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
  // @ts-ignore - window.$boxItems and window.$channel are injected by the plugin system
  const boxItemsAPI = window.$boxItems
  // @ts-ignore
  const channel = window.$channel
  
  if (!boxItemsAPI) {
    throw new Error('[Feature SDK] boxItems API not available. Make sure this is called in a plugin context.')
  }
  
  if (!channel) {
    throw new Error('[Feature SDK] Channel not available. Make sure this is called in a plugin context.')
  }
  
  return createFeatureSDK(boxItemsAPI, channel)
}
