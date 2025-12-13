import type { ComputedRef, Ref } from 'vue'
import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import { useDebounceFn } from '@vueuse/core'
import { watch } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'

type ResizeMode = 'max' | 'collapse'

interface UseResizeOptions {
  results: ComputedRef<TuffItem[]>
  activeActivations: Ref<IProviderActivate[] | null>
  loading: Ref<boolean>
}

function sendResizeCommand(mode: ResizeMode): void {
  touchChannel.sendSync('core-box:expand', { mode })
}

/**
 * Hook for managing CoreBox window resize behavior.
 * Expands when results/providers exist; collapses only when idle.
 */
export function useResize(options: UseResizeOptions): void {
  const { results, activeActivations, loading } = options

  /** Debounced collapse to prevent flicker during rapid state changes */
  const debouncedCollapse = useDebounceFn(() => {
    const hasResults = results.value.length > 0
    const hasActiveProviders = !!(activeActivations.value?.length)
    const isLoading = loading.value

    // Only collapse when truly idle
    if (!hasResults && !hasActiveProviders && !isLoading) {
      sendResizeCommand('collapse')
    }
  }, 50) // Longer debounce for collapse to prevent flicker

  /** Immediate expand when content is available */
  function checkExpand(): void {
    const hasResults = results.value.length > 0
    const hasActiveProviders = !!(activeActivations.value?.length)

    if (hasResults || hasActiveProviders) {
      sendResizeCommand('max')
    }
  }

  // Expand immediately when results arrive
  watch(
    () => results.value,
    (newResults) => {
      if (newResults.length > 0) {
        checkExpand()
      } else {
        debouncedCollapse()
      }
    },
    { deep: true }
  )

  // Expand when loading starts (prevents collapse during search)
  // Collapse only after loading ends AND no results
  watch(
    () => loading.value,
    (isLoading) => {
      if (isLoading) {
        // Don't collapse while loading - keep expanded
        sendResizeCommand('max')
      } else {
        // After loading, check if we should collapse
        debouncedCollapse()
      }
    }
  )

  // Expand when providers become active
  watch(
    () => activeActivations.value,
    (activations) => {
      if (activations && activations.length > 0) {
        sendResizeCommand('max')
      } else {
        debouncedCollapse()
      }
    }
  )
}
