import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { computed, createSSRApp, defineComponent, h, ref } from 'vue'
import * as vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { Component } from 'vue'
import type { AdminGateState } from '~/composables/useAdminGate'
import { loadSfcComponent } from '../../test/helpers/sfc-component'

/**
 * `layouts/admin.vue`: which of its four gate states `<main>` shows, and that a
 * page covered by the route-change skeleton is mounted but out of reach. The gate
 * and the skeleton are stubbed; their own rules are tested beside them.
 */

const gate = {
  state: ref<AdminGateState>('resolving'),
  retrying: ref(false),
  retry: vi.fn(),
}
const routeSkeletonVisible = ref(false)
let errorStateProps: Record<string, unknown> = {}

/** Declares the props the real empty-state family takes, so Vue normalizes them the same way. */
function stateStub(name: string, record?: (props: Record<string, unknown>) => void): Component {
  return defineComponent({
    name,
    props: ['title', 'description', 'loading', 'primaryAction', 'onPrimary'],
    setup(props) {
      record?.(props)
      return () => h('div', { class: `stub-${name}` }, `${props.title} | ${props.description}`)
    },
  })
}

let Layout: Component

beforeAll(async () => {
  vi.stubGlobal('useI18n', () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }))
  Layout = await loadSfcComponent('app/layouts/admin.vue', {
    'vue': vue,
    '@talex-touch/tuffex/error-state': {
      TxErrorState: stateStub('error-state', (props) => {
        errorStateProps = props
      }),
    },
    '@talex-touch/tuffex/permission-state': { TxPermissionState: stateStub('permission-state') },
    '~/components/admin/AdminGateSkeleton.vue': {
      default: defineComponent({ inheritAttrs: true, render: () => h('div', { class: 'stub-skeleton' }) }),
    },
    '~/composables/useAdminGate': {
      useAdminGate: () => ({ state: computed(() => gate.state.value), retrying: gate.retrying, retry: gate.retry }),
    },
    '~/composables/useAdminRouteSkeleton': {
      useAdminRouteSkeleton: () => ({ visible: routeSkeletonVisible }),
    },
  })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

async function render(state: AdminGateState, options: { covered?: boolean, retrying?: boolean } = {}) {
  gate.state.value = state
  gate.retrying.value = options.retrying ?? false
  routeSkeletonVisible.value = options.covered ?? false
  const app = createSSRApp({
    render: () => h(Layout, null, { default: () => h('section', { class: 'probe-page' }, 'page body') }),
  })
  app.component('TheHeader', { render: () => h('header') })
  app.component('AdminNav', { render: () => h('nav') })
  const html = await renderToString(app)
  const main = html.match(/<main[^>]*>[\s\S]*<\/main>/)?.[0] ?? ''
  return { html, main, mainTag: main.match(/^<main[^>]*>/)?.[0] ?? '' }
}

describe('layouts/admin.vue', () => {
  it('draws the skeleton, and never the page, while the gate resolves', async () => {
    const { main, mainTag } = await render('resolving')
    expect(main).toContain('stub-skeleton')
    expect(main).not.toContain('probe-page')
    expect(mainTag).toContain('aria-busy="true"')
  })

  it('shows the denied state instead of the page to a non-administrator', async () => {
    const { main } = await render('denied')
    expect(main).toContain('stub-permission-state')
    expect(main).toContain('Administrator access required')
    expect(main).not.toContain('probe-page')
    expect(main).not.toContain('stub-skeleton')
  })

  it('offers a retry when the profile failed, wired to the gate', async () => {
    const { main, mainTag } = await render('error')
    expect(main).toContain('stub-error-state')
    expect(main).toContain('Could not load your account')
    expect(main).not.toContain('probe-page')
    expect(main).not.toContain('stub-skeleton')
    expect(mainTag).not.toContain('aria-busy')
    expect(errorStateProps.loading).toBe(false)
    expect(errorStateProps.primaryAction).toEqual({ label: 'Retry', variant: 'flat', disabled: false })

    gate.retry.mockClear()
    ;(errorStateProps.onPrimary as () => void)()
    expect(gate.retry).toHaveBeenCalledTimes(1)
  })

  it('keeps the error up with its action disabled while the retry runs', async () => {
    await render('error', { retrying: true })
    expect(errorStateProps.loading).toBe(true)
    expect(errorStateProps.primaryAction).toMatchObject({ disabled: true })
  })

  it('mounts the page for an administrator', async () => {
    const { main, mainTag } = await render('allowed')
    expect(main).toContain('probe-page')
    expect(main).not.toContain('stub-skeleton')
    expect(main).not.toMatch(/admin-shell-page[^"]*is-covered/)
    expect(main).not.toContain('inert')
    expect(mainTag).not.toContain('aria-busy')
  })

  it('covers a page in flight with the skeleton, keeping it mounted but inert', async () => {
    const { main, mainTag } = await render('allowed', { covered: true })
    expect(main).toContain('stub-skeleton')
    expect(main).toContain('probe-page')
    expect(main).toMatch(/<div class="admin-shell-page is-covered" inert[^>]*>/)
    expect(mainTag).toContain('aria-busy="true"')
  })
})
