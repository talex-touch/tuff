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

// Animation timing for height calculation
// Item animation: 0.3s base + stagger delay (max ~0.055s per item)
const ITEM_ANIMATION_BASE_MS = 300
const STAGGER_DELAY_PER_ITEM_MS = 55
const MAX_ANIMATION_WAIT_MS = 600 // Cap animation wait time

// Scrollbar width estimation (varies by platform, ~8-17px typically)
const SCROLLBAR_WIDTH_ESTIMATE = 12

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
 * Considers scrollbar presence for accurate height calculation
 */
function calculateActualHeight(): number {
  const scrollArea = document.querySelector('.CoreBoxRes-Main > .scroll-area')
  if (!scrollArea) {
    return 0
  }
  
  // Get actual scroll dimensions
  const scrollHeight = scrollArea.scrollHeight
  const clientHeight = scrollArea.clientHeight
  
  // Header is 60px, footer is ~44px
  const headerHeight = 60
  const footerHeight = 44
  
  // Check if vertical scrollbar will appear (content overflows)
  // When scrollbar appears, it may cause content reflow
  const willHaveScrollbar = scrollHeight > clientHeight
  
  // If scrollbar will appear, add extra height buffer to account for
  // potential content reflow due to reduced available width
  let extraBuffer = 0
  if (willHaveScrollbar) {
    // When scrollbar appears, available content width decreases
    // This may cause text wrapping and increase content height
    // Add a small buffer to prevent oscillation
    extraBuffer = SCROLLBAR_WIDTH_ESTIMATE
  }
  
  return Math.min(scrollHeight + headerHeight + footerHeight + extraBuffer, 600)
}

/**
 * Calculate animation wait time based on item count
 * Front items animate quickly, later items have staggered delays
 */
function calculateAnimationWaitTime(itemCount: number): number {
  if (itemCount <= 0) return 0
  // Total animation time = base animation + total stagger delay for all items
  const totalStaggerDelay = Math.min(itemCount, 12) * STAGGER_DELAY_PER_ITEM_MS
  return Math.min(ITEM_ANIMATION_BASE_MS + totalStaggerDelay, MAX_ANIMATION_WAIT_MS)
}

export function useResize(options: UseResizeOptions): void {
  const { results, activeActivations, loading } = options

  function checkShouldCollapse(): boolean {
    const hasResults = results.value.length > 0
    const hasActiveProviders = !!(activeActivations.value?.length)
    const isLoading = loading.value
    
    console.debug('[useResize] checkShouldCollapse', { hasResults, hasActiveProviders, isLoading })
    
    // Never collapse when there's an active provider (plugin UI mode)
    if (hasActiveProviders) {
      return false
    }
    
    const shouldCollapse = !hasResults && !isLoading
    console.debug('[useResize] shouldCollapse:', shouldCollapse)
    return shouldCollapse
  }

  const debouncedCollapse = useDebounceFn(() => {
    console.debug('[useResize] debouncedCollapse called')
    if (checkShouldCollapse()) {
      console.debug('[useResize] Sending collapse command')
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

  // Timer for post-animation height recalculation
  let animationHeightTimer: ReturnType<typeof setTimeout> | null = null

  function clearAnimationTimer(): void {
    if (animationHeightTimer) {
      clearTimeout(animationHeightTimer)
      animationHeightTimer = null
    }
  }

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
      
      // Clear any pending animation timer
      clearAnimationTimer()
      
      // Then recalculate based on actual DOM after render
      nextTick(() => {
        // Initial height update (may be inaccurate during animation)
        debouncedUpdateHeight()
        
        // Schedule final height recalculation after animations complete
        const animationWaitTime = calculateAnimationWaitTime(resultCount)
        if (animationWaitTime > 0) {
          animationHeightTimer = setTimeout(() => {
            // Final height calculation after all animations complete
            const finalHeight = calculateActualHeight()
            if (finalHeight > 60) {
              touchChannel.sendSync('core-box:set-height', { height: finalHeight })
            }
            animationHeightTimer = null
          }, animationWaitTime)
        }
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
      console.debug('[useResize] results changed, length:', newResults.length)
      if (newResults.length > 0) {
        // Always update height when results change
        updateHeight()
      } else {
        console.debug('[useResize] No results, calling debouncedCollapse')
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
