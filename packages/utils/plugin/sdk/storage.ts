/**
 * Get the storage for the current plugin.
 * It provides a simple key-value store that is persisted across application launches.
 * The data is stored in a JSON file in the application's support directory.
 * Each plugin has its own separate storage file.
 *
 * @returns An object with methods to interact with the storage.
 */
export function usePluginStorage() {
  // @ts-ignore
  const pluginName = window.$plugin.name as string

  if (!pluginName) {
    throw new Error('[Plugin SDK] Cannot determine plugin name. Make sure this is called in a plugin context.')
  }

  const channel = window.$channel

  return {
    /**
     * Retrieves an item from the storage.
     * @param key The key of the item to retrieve.
     * @returns A promise that resolves with the value of the item, or null if the item does not exist.
     */
    getItem: async (key: string): Promise<any> => {
      return channel.send('plugin:storage:get-item', { pluginName, key })
    },

    /**
     * Stores an item in the storage.
     * @param key The key of the item to store.
     * @param value The value of the item to store.
     * @returns A promise that resolves when the item has been stored.
     */
    setItem: async (key: string, value: any): Promise<{ success: boolean, error?: string }> => {
      return channel.send('plugin:storage:set-item', { pluginName, key, value: JSON.parse(JSON.stringify(value)), fileName: 'config.json' })
    },

    /**
     * Removes an item from the storage.
     * @param key The key of the item to remove.
     * @returns A promise that resolves when the item has been removed.
     */
    removeItem: async (key: string): Promise<{ success: boolean, error?: string }> => {
      return channel.send('plugin:storage:remove-item', { pluginName, key, fileName: 'config.json' })
    },

    /**
     * Clears all items from the storage for the current plugin.
     * @returns A promise that resolves when the storage has been cleared.
     */
    clear: async (): Promise<{ success: boolean, error?: string }> => {
      return channel.send('plugin:storage:clear', { pluginName, fileName: 'config.json' })
    },

    /**
     * Retrieves all items from the storage for the current plugin.
     * @returns A promise that resolves with an object containing all items.
     */
    getAllItems: async (): Promise<Record<string, any>> => {
      return channel.send('plugin:storage:get-all', { pluginName })
    },

    /**
     * Listens for changes to the storage.
     * When `clear()` is called, the key will be `__clear__`.
     * @param fileName The file name to listen for changes
     * @param callback The function to call when the storage changes for the current plugin.
     * @returns A function to unsubscribe from the listener.
     */
    onDidChange: (fileName: string, callback: (newConfig: any) => void) => {
      const listener = (data: { name: string, fileName?: string, key?: string }) => {
        if (data.name === pluginName &&
            (data.fileName === fileName || data.fileName === undefined)) {
          callback(data)
        }
      }

      channel.regChannel('plugin:storage:update', listener)

      return () => {
        channel.unRegChannel('plugin:storage:update', listener)
      }
    }
  }
}
