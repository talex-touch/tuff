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

export function useResize(options: UseResizeOptions): void {
  const { results, activeActivations, loading } = options

  const debouncedCollapse = useDebounceFn(() => {
    const hasResults = results.value.length > 0
    const hasActiveProviders = !!(activeActivations.value?.length)
    const isLoading = loading.value
    if (!hasResults && !hasActiveProviders && !isLoading) {
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
      if (isLoading) sendResizeCommand('max')
      else debouncedCollapse()
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
