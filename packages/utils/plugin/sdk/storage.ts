import type { FileDetails, StorageStats, StorageTreeNode } from '../../types/storage'
import { createPluginTuffTransport } from '../../transport'
import { PluginEvents } from '../../transport/events'
import { ensureRendererChannel } from './channel'
import { usePluginName } from './plugin-info'

/**
 * Get the storage for the current plugin.
 * It provides simple file-based storage that is persisted across application launches.
 * Each plugin can have multiple storage files in its own directory.
 *
 * @returns An object with methods to interact with the storage.
 */
export function usePluginStorage() {
  const pluginName = usePluginName('[Plugin SDK] Cannot determine plugin name. Make sure this is called in a plugin context.')

  const channel = ensureRendererChannel('[Plugin Storage] Channel not available. Make sure this is called in a plugin context.')
  const transport = createPluginTuffTransport(channel as any)

  return {
    /**
     * Retrieves the content of a storage file.
     * @param fileName The name of the file to retrieve.
     * @returns A promise that resolves with the file content, or null if the file does not exist.
     */
    getFile: async (fileName: string): Promise<any> => {
      return transport.send(PluginEvents.storage.getFile, { pluginName, fileName })
    },

    /**
     * Stores content to a storage file.
     * @param fileName The name of the file to store.
     * @param content The content to store in the file.
     * @returns A promise that resolves when the file has been stored.
     */
    setFile: async (fileName: string, content: any): Promise<{ success: boolean, error?: string }> => {
      return transport.send(PluginEvents.storage.setFile, { pluginName, fileName, content: JSON.parse(JSON.stringify(content)) })
    },

    /**
     * Deletes a storage file.
     * @param fileName The name of the file to delete.
     * @returns A promise that resolves when the file has been deleted.
     */
    deleteFile: async (fileName: string): Promise<{ success: boolean, error?: string }> => {
      return transport.send(PluginEvents.storage.deleteFile, { pluginName, fileName })
    },

    /**
     * Lists all storage files for the current plugin.
     * @returns A promise that resolves with an array of file names.
     */
    listFiles: async (): Promise<string[]> => {
      return transport.send(PluginEvents.storage.listFiles, { pluginName })
    },

    /**
     * Gets storage statistics for the current plugin.
     * @returns A promise that resolves with storage statistics.
     */
    getStats: async (): Promise<StorageStats> => {
      return transport.send(PluginEvents.storage.getStats, { pluginName }) as Promise<StorageStats>
    },

    /**
     * Gets the directory tree structure of plugin storage.
     * @returns A promise that resolves with the tree structure.
     */
    getTree: async (): Promise<StorageTreeNode[]> => {
      return transport.send(PluginEvents.storage.getTree, { pluginName }) as Promise<StorageTreeNode[]>
    },

    /**
     * Gets detailed information about a specific file.
     * @param fileName The name of the file to get details for.
     * @returns A promise that resolves with file details.
     */
    getFileDetails: async (fileName: string): Promise<FileDetails | null> => {
      return transport.send(PluginEvents.storage.getFileDetails, { pluginName, fileName }) as Promise<FileDetails | null>
    },

    /**
     * Clears all storage for the current plugin.
     * @returns A promise that resolves with the operation result.
     */
    clearAll: async (): Promise<{ success: boolean, error?: string }> => {
      return transport.send(PluginEvents.storage.clear, { pluginName })
    },

    /**
     * Opens the plugin storage folder in the system file manager.
     * @returns A promise that resolves when the folder is opened.
     */
    openFolder: async (): Promise<void> => {
      await transport.send(PluginEvents.storage.openFolder, { pluginName })
    },

    /**
     * Listens for changes to the storage.
     * @param fileName The file name to listen for changes
     * @param callback The function to call when the storage changes for the current plugin.
     * @returns A function to unsubscribe from the listener.
     */
    onDidChange: (fileName: string, callback: (newConfig: any) => void) => {
      const listener = (data: { name: string, fileName?: string }) => {
        if (data.name === pluginName
          && (data.fileName === fileName || data.fileName === undefined)) {
          callback(data)
        }
      }

      return transport.on(PluginEvents.storage.update, listener)
    },
  }
}
