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
  debounceMs?: number
}

function sendResizeCommand(mode: ResizeMode): void {
  touchChannel.sendSync('core-box:expand', { mode })
}

/**
 * Hook for managing CoreBox window resize behavior
 *
 * Prevents collapse during:
 * - Active search (loading state)
 * - Active providers
 * - Results present
 */
export function useResize(options: UseResizeOptions): void {
  const { results, activeActivations, loading, debounceMs = 10 } = options

  const debouncedResize = useDebounceFn(() => {
    const hasResults = results.value.length > 0
    const hasActiveProviders = !!(activeActivations.value?.length)
    const isLoading = loading.value

    if (hasResults || hasActiveProviders) {
      sendResizeCommand('max')
      return
    }

    if (!isLoading) {
      sendResizeCommand('collapse')
    }
  }, debounceMs)

  watch(
    () => results.value,
    () => debouncedResize(),
    { deep: true }
  )
}
