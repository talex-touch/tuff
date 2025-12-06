import type { IStorageChannel } from './base-storage'

/**
 * Storage subscription callback type
 */
export type StorageSubscriptionCallback = (data: any) => void

/**
 * Storage subscription manager for renderer process
 * Provides easy subscription to storage updates via channel events
 */
class StorageSubscriptionManager {
  private channel: IStorageChannel | null = null
  private subscribers = new Map<string, Set<StorageSubscriptionCallback>>()
  private channelListenerRegistered = false
  private pendingUpdates = new Map<string, NodeJS.Timeout>()
  private configVersions = new Map<string, number>()

  /**
   * Initialize the subscription manager with a channel
   */
  init(channel: IStorageChannel): void {
    this.channel = channel

    if (!this.channelListenerRegistered) {
      // Listen to storage:update events from main process
      this.channel.regChannel('storage:update', ({ data }) => {
        const { name, version } = data as { name: string, version?: number }
        // Only handle update if version is newer or unknown
        const currentVersion = this.configVersions.get(name) ?? 0
        if (version === undefined || version > currentVersion) {
          if (version !== undefined) {
            this.configVersions.set(name, version)
          }
          this.handleStorageUpdate(name)
        }
      })
      this.channelListenerRegistered = true
    }
  }

  /**
   * Subscribe to storage changes for a specific config
   * @param configName - The configuration file name (e.g., 'app-setting.ini')
   * @param callback - Callback function to receive updates
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = subscribeStorage('app-setting.ini', (data) => {
   *   console.log('Config updated:', data)
   * })
   *
   * // Later:
   * unsubscribe()
   * ```
   */
  subscribe(configName: string, callback: StorageSubscriptionCallback): () => void {
    if (!this.subscribers.has(configName)) {
      this.subscribers.set(configName, new Set())
    }

    this.subscribers.get(configName)!.add(callback)

    // Immediately load and call with current data
    if (this.channel) {
      const currentData = this.channel.sendSync('storage:get', configName)
      if (currentData) {
        try {
          callback(currentData)
        }
        catch (error) {
          console.error(`[StorageSubscription] Callback error for "${configName}":`, error)
        }
      }
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribe(configName, callback)
    }
  }

  /**
   * Unsubscribe from storage changes
   * @param configName - The configuration file name
   * @param callback - The same callback function used in subscribe
   */
  unsubscribe(configName: string, callback: StorageSubscriptionCallback): void {
    const callbacks = this.subscribers.get(configName)
    if (callbacks) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        this.subscribers.delete(configName)
      }
    }
  }

  /**
   * Handle storage update events from main process
   * @private
   */
  private async handleStorageUpdate(configName: string): Promise<void> {
    const callbacks = this.subscribers.get(configName)
    if (!callbacks || callbacks.size === 0) {
      return
    }

    if (!this.channel) {
      return
    }

    // Debounce updates to avoid excessive IPC and callback invocations
    const existing = this.pendingUpdates.get(configName)
    if (existing) {
      clearTimeout(existing)
    }

    const timer = setTimeout(async () => {
      // Fetch latest data
      const data = await this.channel!.send('storage:get', configName)
      if (!data) {
        this.pendingUpdates.delete(configName)
        return
      }

      // Notify all subscribers
      callbacks.forEach((callback) => {
        try {
          callback(data)
        }
        catch (error) {
          console.error(`[StorageSubscription] Callback error for "${configName}":`, error)
        }
      })

      this.pendingUpdates.delete(configName)
    }, 50) // 50ms debounce window

    this.pendingUpdates.set(configName, timer)
  }

  /**
   * Get the number of active subscriptions for a config
   * @param configName - The configuration file name
   * @returns Number of active callbacks subscribed to this config
   */
  getSubscriberCount(configName: string): number {
    return this.subscribers.get(configName)?.size ?? 0
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.subscribers.clear()
  }
}

// Global singleton instance
const subscriptionManager = new StorageSubscriptionManager()

/**
 * Initialize storage subscription system with channel
 * Must be called before using subscribeStorage
 *
 * @param channel - The storage channel
 */
export function initStorageSubscription(channel: IStorageChannel): void {
  subscriptionManager.init(channel)
}

/**
 * Subscribe to storage configuration changes
 *
 * @param configName - Configuration file name (e.g., 'app-setting.ini')
 * @param callback - Callback function that receives updated data
 * @returns Unsubscribe function
 *
 * @example
 * ```typescript
 * import { subscribeStorage } from '@talex-touch/utils/renderer/storage/storage-subscription'
 *
 * const unsubscribe = subscribeStorage('app-setting.ini', (data) => {
 *   console.log('Settings updated:', data)
 * })
 *
 * // Clean up when no longer needed
 * unsubscribe()
 * ```
 */
export function subscribeStorage(
  configName: string,
  callback: StorageSubscriptionCallback,
): () => void {
  return subscriptionManager.subscribe(configName, callback)
}

/**
 * Get subscription manager instance (for debugging)
 */
export function getSubscriptionManager(): StorageSubscriptionManager {
  return subscriptionManager
}
