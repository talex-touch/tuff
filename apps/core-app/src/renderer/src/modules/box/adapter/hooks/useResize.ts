import type { ComputedRef, Ref } from 'vue'
import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import { useDebounceFn } from '@vueuse/core'
import { onMounted, watch } from 'vue'
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
      sendResizeCommand('collapse')
    }
  }, 50)

  function checkExpand(): void {
    const hasResults = results.value.length > 0
    const hasActiveProviders = !!(activeActivations.value?.length)

    if (hasResults || hasActiveProviders) {
      sendResizeCommand('max')
    }
  }

  // Initial state check on mount
  onMounted(() => {
    // Give a brief delay for initial data to load
    setTimeout(() => {
      if (checkShouldCollapse()) {
        sendResizeCommand('collapse')
      }
    }, 100)
  })

  watch(
    () => results.value,
    (newResults) => {
      if (newResults.length > 0) checkExpand()
      else debouncedCollapse()
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

  watch(
    () => activeActivations.value,
    (activations) => {
      if (activations && activations.length > 0) sendResizeCommand('max')
      else debouncedCollapse()
    }
  )
}
