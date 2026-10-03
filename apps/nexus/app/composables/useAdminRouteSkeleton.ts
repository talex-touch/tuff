import { onBeforeUnmount, onMounted, onScopeDispose, provide, readonly, ref } from 'vue'
import type { InjectionKey, Ref } from 'vue'
import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'

/** Same delay as `useDeferredLoading`: a switch that lands sooner never shows the skeleton. */
export const ADMIN_ROUTE_SKELETON_DELAY_MS = 150
/** The skeleton never outlives this, even if the next page never reports that it mounted. */
export const ADMIN_ROUTE_SKELETON_TIMEOUT_MS = 10_000

/**
 * Provided by `layouts/admin.vue`; `AdminPageShell` calls it once it has mounted.
 * The shell is every console page's root, so its mount is the moment the next
 * page is really on screen. A registered symbol, so a hot-reloaded copy of this
 * module still meets the layout's provider.
 */
export const ADMIN_PAGE_MOUNTED_KEY = Symbol.for('nexus.admin.page-mounted') as InjectionKey<() => void>

export interface AdminRouteSkeleton {
  /** A switch to another console page is in flight (undelayed). */
  pending: Readonly<Ref<boolean>>
  /** Draw the skeleton: `pending`, delayed and held like every other skeleton. */
  visible: Readonly<Ref<boolean>>
  /** Leaving the current page for `target` (a route path). */
  start: (target: string) => void
  /**
   * The page at `path` has mounted, or the switch ended without one (no `path`).
   * A `path` other than the pending target is ignored: a page that was overtaken by
   * a newer navigation does not end it.
   */
  settle: (path?: string) => void
}

export interface AdminRouteSkeletonOptions {
  delay?: number
  timeout?: number
}

/**
 * The show / hide state of the route-change skeleton. Must run inside an effect
 * scope (a component's setup): the delay comes from `useDeferredLoading`.
 */
export function createAdminRouteSkeleton(options: AdminRouteSkeletonOptions = {}): AdminRouteSkeleton {
  const timeout = options.timeout ?? ADMIN_ROUTE_SKELETON_TIMEOUT_MS
  const pending = ref(false)
  let target: string | null = null
  let safetyTimer: ReturnType<typeof setTimeout> | undefined

  const visible = useDeferredLoading(pending, { delay: options.delay ?? ADMIN_ROUTE_SKELETON_DELAY_MS })

  function clearSafetyTimer() {
    if (safetyTimer !== undefined) {
      clearTimeout(safetyTimer)
      safetyTimer = undefined
    }
  }

  function stop() {
    clearSafetyTimer()
    target = null
    pending.value = false
  }

  onScopeDispose(clearSafetyTimer)

  return {
    pending: readonly(pending),
    visible: readonly(visible),
    start(next) {
      target = next
      pending.value = true
      clearSafetyTimer()
      // The fallback for a switch whose next page never mounts — a page
      // transition that never finishes leaves `<main>` empty, and a skeleton
      // there forever would only disguise it.
      safetyTimer = setTimeout(stop, timeout)
    },
    settle(path) {
      if (!pending.value)
        return
      if (path !== undefined && target !== null && path !== target)
        return
      stop()
    },
  }
}

interface RouteLike {
  path: string
  meta: Record<string | number | symbol, unknown>
}

export interface AdminRouteSkeletonRouter {
  beforeEach: (guard: (to: RouteLike, from: RouteLike) => void) => () => void
  afterEach: (hook: (to: RouteLike, from: RouteLike, failure?: unknown) => void) => () => void
  onError: (handler: (error: unknown) => void) => () => void
  currentRoute: Readonly<Ref<{ path: string }>>
}

/**
 * Connects the skeleton to the router and to Nuxt's page lifecycle.
 *
 * - starts when a navigation leaves one path for another console page (a query
 *   change on the same page — filters, `?tab=` — is not a page switch);
 * - settles when the next page mounts (`AdminPageShell`), when Nuxt's
 *   `page:transition:finish` reports the outgoing page gone and the next one in,
 *   or when the navigation fails or is aborted;
 * - `page:finish` is deliberately not an end signal: it fires when the next page
 *   has resolved, which under an `out-in` transition is before it is inserted, and
 *   also when the transition then never completes.
 */
export function bindAdminRouteSkeleton(
  skeleton: AdminRouteSkeleton,
  router: AdminRouteSkeletonRouter,
  onTransitionFinish: (callback: () => void) => () => void,
): () => void {
  const removers = [
    router.beforeEach((to, from) => {
      if (to.path !== from.path && to.meta?.layout === 'admin')
        skeleton.start(to.path)
    }),
    router.afterEach((to, _from, failure) => {
      if (failure)
        skeleton.settle(to.path)
    }),
    router.onError(() => skeleton.settle()),
    onTransitionFinish(() => skeleton.settle(router.currentRoute.value.path)),
  ]
  return () => {
    for (const remove of removers)
      remove()
  }
}

/**
 * The route-change skeleton for `layouts/admin.vue`. Router hooks are attached on
 * mount, so nothing runs on the server and the first frame never shows it.
 */
export function useAdminRouteSkeleton(): { visible: Readonly<Ref<boolean>> } {
  const skeleton = createAdminRouteSkeleton()
  const router = useRouter()
  const nuxtApp = useNuxtApp()
  let unbind: (() => void) | null = null

  provide(ADMIN_PAGE_MOUNTED_KEY, () => skeleton.settle(router.currentRoute.value.path))

  onMounted(() => {
    unbind = bindAdminRouteSkeleton(
      skeleton,
      router,
      callback => nuxtApp.hook('page:transition:finish', callback),
    )
  })

  onBeforeUnmount(() => {
    unbind?.()
    unbind = null
  })

  return { visible: skeleton.visible }
}
