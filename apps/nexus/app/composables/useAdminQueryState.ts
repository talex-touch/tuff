import { computed } from 'vue'
import type { WritableComputedRef } from 'vue'

type QueryValue = string | null | Array<string | null> | undefined

function firstQueryValue(value: QueryValue): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first : undefined
}

/**
 * One `?section=` / `?tab=`-style query key as a writable ref.
 *
 * Reading falls back to `fallback` for a missing or unknown value, so an old
 * bookmark never lands on a panel that no longer exists. Writing replaces the
 * history entry (switching a panel is not a navigation the back button should
 * replay) and drops the key when it equals `fallback`, so the default panel has
 * one canonical address. Every other query key is kept.
 */
export function useAdminQueryState<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): WritableComputedRef<T> {
  const route = useRoute()
  const router = useRouter()

  return computed<T>({
    get() {
      const value = firstQueryValue(route.query[key] as QueryValue)
      return value !== undefined && (allowed as readonly string[]).includes(value) ? value as T : fallback
    },
    set(next) {
      const value = (allowed as readonly string[]).includes(next) ? next : fallback
      const current = firstQueryValue(route.query[key] as QueryValue)
      // Already the address this value would write: no navigation at all.
      if (value === fallback ? current === undefined : current === value)
        return
      const query: Record<string, QueryValue> = {}
      for (const [name, current] of Object.entries(route.query)) {
        if (name !== key)
          query[name] = current as QueryValue
      }
      if (value !== fallback)
        query[key] = value
      void router.replace({ path: route.path, query, hash: route.hash })
    },
  })
}
