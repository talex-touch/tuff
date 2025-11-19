/**
 * Language Sync Composable
 * Synchronizes language changes between renderer and main process
 */

import { watch } from 'vue'
import { useLanguage } from './useLanguage'

/**
 * Setup language synchronization with main process
 * This should be called once during app initialization
 */
export function setupLanguageSync() {
  const { currentLanguage } = useLanguage()

  // Watch for language changes and notify main process
  watch(
    currentLanguage,
    (newLang) => {
      // Send language change to main process via IPC
      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.send('app:set-locale', newLang)
        console.log(`[LanguageSync] Notified main process of language change: ${newLang}`)
      }
    },
    { immediate: true },
  )
}
