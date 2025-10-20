/**
 * Get the storage for the current plugin.
 * It provides simple file-based storage that is persisted across application launches.
 * Each plugin can have multiple storage files in its own directory.
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
     * Retrieves the content of a storage file.
     * @param fileName The name of the file to retrieve.
     * @returns A promise that resolves with the file content, or null if the file does not exist.
     */
    getFile: async (fileName: string): Promise<any> => {
      return channel.send('plugin:storage:get-file', { pluginName, fileName })
    },

    /**
     * Stores content to a storage file.
     * @param fileName The name of the file to store.
     * @param content The content to store in the file.
     * @returns A promise that resolves when the file has been stored.
     */
    setFile: async (fileName: string, content: any): Promise<{ success: boolean, error?: string }> => {
      return channel.send('plugin:storage:set-file', { pluginName, fileName, content: JSON.parse(JSON.stringify(content)) })
    },

    /**
     * Deletes a storage file.
     * @param fileName The name of the file to delete.
     * @returns A promise that resolves when the file has been deleted.
     */
    deleteFile: async (fileName: string): Promise<{ success: boolean, error?: string }> => {
      return channel.send('plugin:storage:delete-file', { pluginName, fileName })
    },

    /**
     * Lists all storage files for the current plugin.
     * @returns A promise that resolves with an array of file names.
     */
    listFiles: async (): Promise<string[]> => {
      return channel.send('plugin:storage:list-files', { pluginName })
    },

    /**
     * Listens for changes to the storage.
     * @param fileName The file name to listen for changes
     * @param callback The function to call when the storage changes for the current plugin.
     * @returns A function to unsubscribe from the listener.
     */
    onDidChange: (fileName: string, callback: (newConfig: any) => void) => {
      const listener = (data: { name: string, fileName?: string }) => {
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
