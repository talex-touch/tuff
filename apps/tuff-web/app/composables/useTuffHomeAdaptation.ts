import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'

interface UseTuffHomeAdaptationOptions {
  mobileMaxWidth?: number
}

const DEFAULT_MOBILE_MAX_WIDTH = 768

export function useTuffHomeAdaptation(options: UseTuffHomeAdaptationOptions = {}) {
  const mobileMaxWidth = options.mobileMaxWidth ?? DEFAULT_MOBILE_MAX_WIDTH
  const isMobile = useMediaQuery(`(max-width: ${mobileMaxWidth}px)`)
  const enableSmoothScroll = computed(() => !isMobile.value)

  return {
    isMobile,
    enableSmoothScroll,
  }
}
