/**
 * AppSettings Loader
 *
 * Handles lazy loading of appSettings to avoid initialization
 * before initStorageChannel is called.
 */

let appSettingsCache: any = null

/**
 * Asynchronously load appSettings
 * @returns Promise resolving to appSettings instance
 */
export async function getAppSettingsSync(): Promise<any> {
  if (!appSettingsCache) {
    try {
      // Dynamic import to avoid module-level instantiation
      const module = await import('@talex-touch/utils/renderer/storage/app-settings')
      appSettingsCache = module.appSettings
    } catch (error) {
      // appSettings not available yet
      return null
    }
  }
  return appSettingsCache
}

/**
 * Synchronously get cached appSettings (may be null if not initialized)
 * @returns Cached appSettings instance or null
 */
export function getAppSettings(): any {
  return appSettingsCache
}

/**
 * Initialize appSettings cache (called after initStorageChannel)
 */
export async function initializeAppSettings(): Promise<void> {
  try {
    await getAppSettingsSync()
  } catch (error) {
    // Will retry later
  }
}

