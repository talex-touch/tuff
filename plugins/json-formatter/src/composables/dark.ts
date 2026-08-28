import { initializePluginTheme } from '@talex-touch/utils/plugin/theme'
import { ref } from 'vue'

export const isDark = ref(document.documentElement.classList.contains('dark'))

initializePluginTheme((nextDark) => {
  isDark.value = nextDark
})
