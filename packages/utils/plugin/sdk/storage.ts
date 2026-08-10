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
     *
     * The broadcast carries only `{ name, fileName }`, so the new content is read back before the
     * callback runs - the callback receives what `getFile` would return, or `null` once the file
     * is gone.
     *
     * A broadcast with no `fileName` is `clearStorage()`, which empties every storage root. Every
     * subscribed file really did change, so every subscriber is notified and each reads back
     * `null`. Suppressing those would leave subscribers serving state for files that no longer
     * exist.
     *
     * @param fileName The file name to listen for changes
     * @param callback The function to call when the storage changes for the current plugin.
     * @returns A function to unsubscribe from the listener.
     */
    onDidChange: (fileName: string, callback: (newConfig: any) => void) => {
      let latestTicket = 0

      const listener = (data: { name: string, fileName?: string }) => {
        if (data.name !== pluginName)
          return
        if (data.fileName !== undefined && data.fileName !== fileName)
          return

        // Reading back is asynchronous, so two quick writes can resolve out of order. Only the
        // most recently requested read is allowed to reach the callback.
        const ticket = ++latestTicket
        transport
          .send(PluginEvents.storage.getFile, { pluginName, fileName })
          .then((content: unknown) => {
            if (ticket === latestTicket)
              callback(content)
          })
          .catch((error: unknown) => {
            console.error(`[Plugin Storage] Failed to read "${fileName}" after a change notification:`, error)
          })
      }

      return transport.on(PluginEvents.storage.update, listener)
    },
  }
}
