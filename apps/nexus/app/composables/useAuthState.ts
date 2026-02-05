import type { ComputedRef, Ref } from 'vue'
import { computed } from 'vue'

type BoolSource = Ref<boolean> | ComputedRef<boolean>

export function useAuthState(sources: BoolSource[]) {
  const loading = computed(() => {
    return sources.some(source => Boolean(source.value))
  })

  return {
    loading,
  }
}
