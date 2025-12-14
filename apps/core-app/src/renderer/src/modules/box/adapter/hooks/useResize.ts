import type { ComputedRef, Ref } from 'vue'
import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import { useDebounceFn } from '@vueuse/core'
import { nextTick, onMounted, watch } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'

interface UseResizeOptions {
  results: ComputedRef<TuffItem[]>
  activeActivations: Ref<IProviderActivate[] | null>
  loading: Ref<boolean>
}

// Debounce time for collapse operations - longer to avoid flickering
const COLLAPSE_DEBOUNCE_MS = 100

function sendExpandCommand(length: number, forceMax: boolean = false): void {
  if (forceMax) {
    touchChannel.sendSync('core-box:expand', { mode: 'max' })
  } else {
    touchChannel.sendSync('core-box:expand', { length })
  }
}

function sendCollapseCommand(): void {
  touchChannel.sendSync('core-box:expand', { mode: 'collapse' })
}

/**
 * Calculate actual content height from DOM
 * Returns the scroll height of the result container + header height
 */
function calculateActualHeight(): number {
  const scrollArea = document.querySelector('.CoreBoxRes-Main > .scroll-area')
  if (!scrollArea) {
    return 0
  }
  
  // Get the scroll height (includes overflow content)
  const scrollHeight = scrollArea.scrollHeight
  // Header is 60px, footer is ~44px
  const headerHeight = 60
  const footerHeight = 44
  
  return Math.min(scrollHeight + headerHeight + footerHeight, 600)
}

export function useResize(options: UseResizeOptions): void {
  const { results, activeActivations, loading } = options

  function checkShouldCollapse(): boolean {
    const hasResults = results.value.length > 0
    const hasActiveProviders = !!(activeActivations.value?.length)
    const isLoading = loading.value
    
    // Never collapse when there's an active provider (plugin UI mode)
    if (hasActiveProviders) {
      return false
    }
    
    return !hasResults && !isLoading
  }

  const debouncedCollapse = useDebounceFn(() => {
    if (checkShouldCollapse()) {
      sendCollapseCommand()
    }
  }, COLLAPSE_DEBOUNCE_MS)

  // Debounced height update based on actual DOM content
  const debouncedUpdateHeight = useDebounceFn(() => {
    const hasActiveProviders = !!(activeActivations.value?.length)
    
    // When activeProvider exists, expand to max (plugin UI mode)
    if (hasActiveProviders) {
      sendExpandCommand(0, true)
      return
    }

    const resultCount = results.value.length
    if (resultCount > 0) {
      // Use actual DOM height for more accurate sizing
      const actualHeight = calculateActualHeight()
      if (actualHeight > 60) {
        touchChannel.sendSync('core-box:set-height', { height: actualHeight })
      } else {
        // Fallback to count-based calculation
        sendExpandCommand(resultCount)
      }
    } else {
      debouncedCollapse()
    }
  }, 50)

  function updateHeight(): void {
    const hasActiveProviders = !!(activeActivations.value?.length)

    // When activeProvider exists, expand to max immediately
    if (hasActiveProviders) {
      sendExpandCommand(0, true)
      return
    }

    const resultCount = results.value.length
    if (resultCount > 0) {
      // First send count-based height for immediate response
      sendExpandCommand(resultCount)
      // Then recalculate based on actual DOM after render
      nextTick(() => {
        debouncedUpdateHeight()
      })
    }
  }

  // Initial state check on mount
  onMounted(() => {
    // Give a brief delay for initial data to load
    setTimeout(() => {
      if (checkShouldCollapse()) {
        sendCollapseCommand()
      }
    }, 100)
  })

  // Watch results - always recalculate height on change
  watch(
    () => results.value,
    (newResults) => {
      if (newResults.length > 0) {
        // Always update height when results change
        updateHeight()
      } else {
        debouncedCollapse()
      }
    },
    { deep: true }
  )

  watch(
    () => loading.value,
    (isLoading) => {
      // Don't expand just because loading started - wait for actual results
      // Only collapse when loading finishes and there are no results
      if (!isLoading) debouncedCollapse()
    }
  )

  // When activeActivations change, expand to max
  watch(
    () => activeActivations.value,
    (activations) => {
      if (activations && activations.length > 0) {
        // Active provider: expand to max immediately, no collapse allowed
        sendExpandCommand(0, true)
      } else {
        debouncedCollapse()
      }
    }
  )
}
