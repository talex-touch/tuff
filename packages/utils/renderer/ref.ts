import type { WritableComputedRef } from 'vue'
import { computed, customRef } from 'vue'

export function useModelWrapper<
  P extends Record<string, unknown>,
  K extends string = 'modelValue'
>(
  props: P,
  emit: (event: `update:${K}`, value: P[K]) => void,
  name?: K
): WritableComputedRef<P[K]> {
  const key = (name ?? 'modelValue') as K
  return computed({
    get: () => props[key] as P[K],
    set: value => emit(`update:${key}` as `update:${K}`, value),
  })
}

export function throttleRef<T>(value: T, time: number) {
  let ts = 0

  return customRef<T>((track, trigger) => {
    return {
      get() {
        track()
        return value
      },
      set(newValue) {
        if (Date.now() - ts < time)
          return

        value = newValue
        track()
        trigger()
        ts = Date.now()
      },
    }
  })
}

export function debounceRef<T>(value: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | undefined

  return customRef<T>((track, trigger) => {
    return {
      get() {
        track()
        return value
      },
      set(newValue) {
        clearTimeout(timer)
        timer = setTimeout(() => {
          value = newValue
          track()
          trigger()
        }, delay)
      },
    }
  })
}
