/**
 * Language Sync Composable
 * Synchronizes language changes between renderer and main process
 */

import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { watch } from 'vue'
import { useLanguage } from './useLanguage'

/**
 * Setup language synchronization with main process
 * This should be called once during app initialization
 */
export function setupLanguageSync() {
  const { currentLanguage } = useLanguage()
  const transport = useTuffTransport()

  // Watch for language changes and notify main process
  watch(
    currentLanguage,
    (newLang) => {
      void transport.send(AppEvents.i18n.setLocale, { locale: newLang as any }).catch(() => {})
    },
    { immediate: true }
  )
}
