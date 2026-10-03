import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, createSSRApp, defineComponent, effectScope, h, inject, nextTick, onMounted, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { EffectScope } from 'vue'
import {
  ADMIN_PAGE_MOUNTED_KEY,
  ADMIN_ROUTE_SKELETON_DELAY_MS,
  ADMIN_ROUTE_SKELETON_TIMEOUT_MS,
  bindAdminRouteSkeleton,
  createAdminRouteSkeleton,
  useAdminRouteSkeleton,
} from './useAdminRouteSkeleton'
import type { AdminRouteSkeleton, AdminRouteSkeletonRouter } from './useAdminRouteSkeleton'

/**
 * The route-change skeleton in `layouts/admin.vue` (PRD R1b): shown only after a
 * switch has taken longer than the delay, gone the moment the next page has
 * mounted, and gone anyway if it never does — a stuck `out-in` transition left
 * `<main>` blank on :3200, and a skeleton there forever would only hide that.
 */

let scope: EffectScope

function setup(options?: Parameters<typeof createAdminRouteSkeleton>[0]): AdminRouteSkeleton {
  scope = effectScope()
  return scope.run(() => createAdminRouteSkeleton(options))!
}

/** Lets the watchers see the last change first, then moves the clock. */
async function advance(ms: number) {
  await nextTick()
  vi.advanceTimersByTime(ms)
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  scope?.stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('createAdminRouteSkeleton', () => {
  it('waits out the delay before showing anything', async () => {
    const skeleton = setup()
    skeleton.start('/admin/analytics')
    await nextTick()

    expect(skeleton.pending.value).toBe(true)
    expect(skeleton.visible.value).toBe(false)

    await advance(ADMIN_ROUTE_SKELETON_DELAY_MS - 1)
    expect(skeleton.visible.value).toBe(false)

    await advance(1)
    expect(skeleton.visible.value).toBe(true)
  })

  it('never appears for a switch that lands inside the delay', async () => {
    const skeleton = setup()
    skeleton.start('/admin/users')
    await advance(ADMIN_ROUTE_SKELETON_DELAY_MS / 2)
    skeleton.settle('/admin/users')
    await nextTick()
    await advance(ADMIN_ROUTE_SKELETON_DELAY_MS * 4)

    expect(skeleton.pending.value).toBe(false)
    expect(skeleton.visible.value).toBe(false)
  })

  it('goes away once the next page has mounted, after its minimum display', async () => {
    const skeleton = setup()
    skeleton.start('/admin/analytics')
    // Shown at 150 ms.
    await advance(ADMIN_ROUTE_SKELETON_DELAY_MS)
    expect(skeleton.visible.value).toBe(true)
    await advance(50)

    skeleton.settle('/admin/analytics')
    await nextTick()
    expect(skeleton.pending.value).toBe(false)
    // Held for useDeferredLoading's 400 ms minimum so it does not vanish
    // half-drawn: 150 + 400 = 550 ms, then gone.
    await advance(349)
    expect(skeleton.visible.value).toBe(true)
    await advance(1)
    expect(skeleton.visible.value).toBe(false)
  })

  it('ignores a page that was overtaken by a newer navigation', async () => {
    const skeleton = setup()
    skeleton.start('/admin/users')
    skeleton.start('/admin/analytics')
    skeleton.settle('/admin/users')
    await advance(ADMIN_ROUTE_SKELETON_DELAY_MS)

    expect(skeleton.pending.value).toBe(true)
    expect(skeleton.visible.value).toBe(true)

    skeleton.settle('/admin/analytics')
    await advance(1000)
    expect(skeleton.visible.value).toBe(false)
  })

  it('cannot hang when the next page never reports in', async () => {
    // The transition that never finishes: no mount, no transition-finish hook.
    const skeleton = setup()
    skeleton.start('/admin/analytics')
    await advance(ADMIN_ROUTE_SKELETON_DELAY_MS)
    expect(skeleton.visible.value).toBe(true)

    await advance(ADMIN_ROUTE_SKELETON_TIMEOUT_MS)
    await advance(1000)
    expect(skeleton.pending.value).toBe(false)
    expect(skeleton.visible.value).toBe(false)
  })

  it('restarts the safety timeout for each navigation', async () => {
    const skeleton = setup({ timeout: 1000 })
    skeleton.start('/admin/users')
    await advance(900)
    skeleton.start('/admin/analytics')
    await advance(900)
    expect(skeleton.pending.value).toBe(true)

    await advance(100)
    expect(skeleton.pending.value).toBe(false)
  })
})

interface RouteStub {
  path: string
  meta: Record<string, unknown>
}

/** A router reduced to the four hooks the skeleton listens to, driven by hand. */
function createFakeNavigation() {
  const before = new Set<(to: RouteStub, from: RouteStub) => void>()
  const after = new Set<(to: RouteStub, from: RouteStub, failure?: unknown) => void>()
  const errors = new Set<(error: unknown) => void>()
  const transitions = new Set<() => void>()
  const currentRoute = ref({ path: '/admin/audits' })

  function register<T>(set: Set<T>, value: T): () => void {
    set.add(value)
    return () => {
      set.delete(value)
    }
  }

  const router: AdminRouteSkeletonRouter = {
    currentRoute,
    beforeEach: guard => register(before, guard),
    afterEach: hook => register(after, hook),
    onError: handler => register(errors, handler),
  }

  return {
    router,
    onTransitionFinish: (callback: () => void) => register(transitions, callback),
    navigate(to: string, from: string, options: { layout?: string, failure?: unknown, error?: unknown } = {}) {
      const target = { path: to, meta: { layout: options.layout ?? 'admin' } }
      const source = { path: from, meta: { layout: 'admin' } }
      before.forEach(guard => guard(target, source))
      if (options.error !== undefined) {
        errors.forEach(handler => handler(options.error))
        return
      }
      if (!options.failure)
        currentRoute.value = { path: to }
      after.forEach(hook => hook(target, source, options.failure))
    },
    transitionFinish: () => transitions.forEach(callback => callback()),
    listeners: () => before.size + after.size + errors.size + transitions.size,
  }
}

function bind(skeleton: AdminRouteSkeleton) {
  const navigation = createFakeNavigation()
  const unbind = bindAdminRouteSkeleton(skeleton, navigation.router, navigation.onTransitionFinish)
  return { ...navigation, unbind }
}

describe('bindAdminRouteSkeleton', () => {
  it('starts on a switch to another console page, not on a query change', () => {
    const skeleton = setup()
    const router = bind(skeleton)

    router.navigate('/admin/audits', '/admin/audits')
    expect(skeleton.pending.value).toBe(false)

    router.navigate('/dashboard/overview', '/admin/audits', { layout: 'dashboard' })
    expect(skeleton.pending.value).toBe(false)

    router.navigate('/admin/analytics', '/admin/audits')
    expect(skeleton.pending.value).toBe(true)
  })

  it('ends when Nuxt reports the page transition finished', () => {
    const skeleton = setup()
    const router = bind(skeleton)

    router.navigate('/admin/analytics', '/admin/audits')
    router.transitionFinish()
    expect(skeleton.pending.value).toBe(false)
  })

  it('ends when the navigation is aborted or fails', () => {
    const skeleton = setup()
    const router = bind(skeleton)

    router.navigate('/admin/analytics', '/admin/audits', { failure: { type: 4 } })
    expect(skeleton.pending.value).toBe(false)

    router.navigate('/admin/users', '/admin/audits', { error: new Error('chunk failed') })
    expect(skeleton.pending.value).toBe(false)
  })

  it('removes every listener when unbound', () => {
    const skeleton = setup()
    const router = bind(skeleton)
    expect(router.listeners()).toBe(4)

    router.unbind()
    expect(router.listeners()).toBe(0)
  })
})

describe('useAdminRouteSkeleton', () => {
  // A renderer with no DOM: enough to run setup, provide/inject and onMounted the
  // way the layout and AdminPageShell do.
  const renderer = createRenderer<object, object>({
    patchProp: () => undefined,
    insert: () => undefined,
    remove: () => undefined,
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText: () => undefined,
    setElementText: () => undefined,
    parentNode: () => null,
    nextSibling: () => null,
  })

  it('ends when the next page shell mounts, without waiting for any hook', async () => {
    const navigation = createFakeNavigation()
    vi.stubGlobal('useRouter', () => navigation.router)
    vi.stubGlobal('useNuxtApp', () => ({
      hook: (_name: string, callback: () => void) => navigation.onTransitionFinish(callback),
    }))

    // Stands in for AdminPageShell: reports itself once it has mounted.
    const PageShell = defineComponent({
      setup() {
        const notify = inject(ADMIN_PAGE_MOUNTED_KEY, null)
        onMounted(() => notify?.())
        return () => null
      },
    })
    const pageMounted = ref(false)
    let visible: { value: boolean } | undefined
    const Layout = defineComponent({
      setup() {
        visible = useAdminRouteSkeleton().visible
        return () => (pageMounted.value ? h(PageShell) : null)
      },
    })

    const app = renderer.createApp(Layout)
    app.mount({})
    await nextTick()
    expect(navigation.listeners()).toBe(4)

    // The transition never finishes, so no hook will ever end this switch.
    navigation.navigate('/admin/analytics', '/admin/audits')
    await advance(ADMIN_ROUTE_SKELETON_DELAY_MS)
    expect(visible?.value).toBe(true)

    pageMounted.value = true
    await advance(1000)
    expect(visible?.value).toBe(false)

    app.unmount()
    expect(navigation.listeners()).toBe(0)
  })

  it('attaches nothing on the server and renders no skeleton there', async () => {
    const navigation = createFakeNavigation()
    vi.stubGlobal('useRouter', () => navigation.router)
    vi.stubGlobal('useNuxtApp', () => ({
      hook: (_name: string, callback: () => void) => navigation.onTransitionFinish(callback),
    }))

    let visible: { value: boolean } | undefined
    const Layout = defineComponent({
      setup() {
        visible = useAdminRouteSkeleton().visible
        return () => h('main', visible?.value ? 'skeleton' : '')
      },
    })

    const html = await renderToString(createSSRApp(Layout))
    expect(html).toBe('<main></main>')
    expect(visible?.value).toBe(false)
    // Hooks are bound on mount, which the server never reaches.
    expect(navigation.listeners()).toBe(0)
  })
})
