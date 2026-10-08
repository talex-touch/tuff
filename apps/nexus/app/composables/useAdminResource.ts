import { computed, getCurrentInstance, getCurrentScope, onMounted, onScopeDispose, readonly, ref, shallowRef } from 'vue'
import type { Ref } from 'vue'
import { resolveAdminErrorMessage } from '~/utils/admin-request-error'

export interface AdminResourceOptions<T> {
  /** Sends the request. With `immediate`, once after the composable is created; then once per `refresh()`. */
  fetch: () => Promise<T>
  /** Localized line shown when the error carries no message the server wrote for people. */
  errorFallback: () => string
  /** Request as soon as the composable is created. @default true */
  immediate?: boolean
}

export interface AdminResource<T> {
  /** The last successful result. Kept through a refresh and through a failure. */
  data: Readonly<Ref<T | null>>
  /** A request is running and there is no `data` yet: draw the skeleton. */
  loading: Readonly<Ref<boolean>>
  /** A request is running and `data` stays on screen. */
  refreshing: Readonly<Ref<boolean>>
  /** The localized message when the last request to finish failed; `null` once one succeeds. */
  error: Readonly<Ref<string | null>>
  /** Sends a request. Resolves when that request has settled; never rejects. */
  refresh: () => Promise<void>
}

/**
 * One administrator request that is not a paged list: an overview, an on-demand
 * lookup, one load that feeds several blocks. A paged list is `useAdminList`.
 *
 * - `loading` and `refreshing` split one in-flight request by whether there is
 *   `data` to keep on screen, so a first load draws a skeleton and a refresh
 *   does not.
 * - A failure keeps `data` and reports a presentable message through
 *   `resolveAdminErrorMessage`, never the transport's `[GET] "/api/…"` text. The
 *   next success clears it.
 * - Every `refresh()` is a new generation and only the newest writes state: an
 *   older request that answers late, with a result or a failure, is dropped.
 *   So is anything that answers after the owning scope is disposed.
 * - With `immediate` (the default) the first request goes out on mount, as
 *   `useAdminList`'s does, and `loading` is already true before it: a block never
 *   says "no data" before it has asked. Outside a component it goes out at once.
 *   `immediate: false` waits for the first `refresh()`.
 */
export function useAdminResource<T>(options: AdminResourceOptions<T>): AdminResource<T> {
  const immediate = options.immediate !== false
  const data = shallowRef<T | null>(null)
  const pending = ref(immediate)
  const error = ref<string | null>(null)
  let generation = 0
  let disposed = false

  async function load(): Promise<void> {
    if (disposed)
      return
    const request = ++generation
    pending.value = true
    try {
      const result = await options.fetch()
      if (request !== generation)
        return
      data.value = result
      error.value = null
    }
    catch (cause) {
      if (request !== generation)
        return
      error.value = resolveAdminErrorMessage(cause, options.errorFallback())
    }
    finally {
      if (request === generation)
        pending.value = false
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      // Drops any response still in flight: nothing writes state after unmount.
      generation += 1
    })
  }

  if (immediate) {
    if (getCurrentInstance())
      onMounted(() => void load())
    else if (!import.meta.server)
      void load()
  }

  return {
    data,
    loading: computed(() => pending.value && data.value === null),
    refreshing: computed(() => pending.value && data.value !== null),
    error: readonly(error),
    refresh: load,
  }
}
