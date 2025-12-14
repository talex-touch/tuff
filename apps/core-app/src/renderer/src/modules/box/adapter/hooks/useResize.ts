import type { ComputedRef, Ref } from 'vue'
import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import { useDebounceFn } from '@vueuse/core'
import { onMounted, watch } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'

interface UseResizeOptions {
  results: ComputedRef<TuffItem[]>
  activeActivations: Ref<IProviderActivate[] | null>
  loading: Ref<boolean>
}

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

export function useResize(options: UseResizeOptions): void {
  const { results, activeActivations, loading } = options

  function checkShouldCollapse(): boolean {
    const hasResults = results.value.length > 0
    const hasActiveProviders = !!(activeActivations.value?.length)
    const isLoading = loading.value
    return !hasResults && !hasActiveProviders && !isLoading
  }

  const debouncedCollapse = useDebounceFn(() => {
    if (checkShouldCollapse()) {
      sendCollapseCommand()
    }
  }, 50)

  function updateHeight(): void {
    const resultCount = results.value.length
    const hasActiveProviders = !!(activeActivations.value?.length)

    // When activeProvider exists, expand to max
    if (hasActiveProviders) {
      sendExpandCommand(resultCount, true)
      return
    }

    if (resultCount > 0) {
      // Always send current result count for accurate height calculation
      sendExpandCommand(resultCount)
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
        // Active provider: expand to max
        sendExpandCommand(results.value.length, true)
      } else {
        debouncedCollapse()
      }
    }
  )
}
