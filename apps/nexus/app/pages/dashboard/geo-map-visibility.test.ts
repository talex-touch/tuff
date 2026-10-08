import type { App, Component, Ref } from 'vue'
import * as tuffexEmptyState from '@talex-touch/tuffex/empty-state'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { createRenderer, defineComponent, h, nextTick, ref } from 'vue'
import { createRouteI18n } from '../../../test/helpers/route-i18n'
import { loadSfcComponent } from '../../../test/helpers/sfc-component'
import * as accountDisplay from '~/utils/account-display'

/**
 * Mount the actual dashboard pages and GeoBubbleMap adapter. Only transport and
 * unrelated UI primitives are substituted; the real TxEmptyState renders the
 * adapter's chosen message. This does not cover authentication, backend data,
 * chart geometry, or the dropdown's browser positioning/keyboard behavior.
 */
interface HostNode {
  tag: string
  text: string
  props: Record<string, unknown>
  parent: HostNode | null
  children: HostNode[]
}

function node(tag: string, text = ''): HostNode {
  return { tag, text, props: {}, parent: null, children: [] }
}

function remove(child: HostNode) {
  if (child.parent) {
    const index = child.parent.children.indexOf(child)
    if (index !== -1)
      child.parent.children.splice(index, 1)
    child.parent = null
  }
}

function insert(child: HostNode, parent: HostNode, anchor: HostNode | null = null) {
  remove(child)
  const index = anchor ? parent.children.indexOf(anchor) : -1
  parent.children.splice(index < 0 ? parent.children.length : index, 0, child)
  child.parent = parent
}

// A local Vue host, not a replacement page model: retain rendered elements,
// events and parent identity so updates can prove that the map stays mounted.
const renderer = createRenderer<HostNode, HostNode>({
  patchProp: (el, key, _previous, value) => { el.props[key] = value },
  insert,
  remove,
  createElement: tag => node(tag),
  createText: text => node('#text', text),
  createComment: text => node('#comment', text),
  setText: (el, text) => { el.text = text },
  setElementText: (el, text) => {
    for (const child of el.children)
      child.parent = null
    el.children = []
    el.text = text
  },
  parentNode: el => el.parent,
  nextSibling: (el) => {
    const siblings = el.parent?.children ?? []
    return siblings[siblings.indexOf(el) + 1] ?? null
  },
  setScopeId: () => undefined,
  insertStaticContent: (content, parent, anchor) => {
    const el = node('#static', content)
    insert(el, parent, anchor)
    return [el, el]
  },
})

function all(root: HostNode, predicate: (el: HostNode) => boolean): HostNode[] {
  return [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => all(child, predicate))]
}

function text(root: HostNode): string {
  return [root.tag === '#comment' ? '' : root.text, ...root.children.map(text)].join(' ').replace(/\s+/g, ' ').trim()
}

function byClass(root: HostNode, name: string): HostNode[] {
  return all(root, el => String(el.props.class ?? '').split(/\s+/).includes(name))
}

function only(elements: HostNode[]): HostNode {
  expect(elements).toHaveLength(1)
  return elements[0]!
}

async function settle() {
  // All SFC modules are already compiled; their lazy imports resolve in the
  // microtask queue. Drain it, then Vue's render queue, without a clock delay.
  await new Promise<void>(resolve => setImmediate(resolve))
  await nextTick()
}

async function click(element: HostNode) {
  expect(element.props.disabled).not.toBe(true)
  const handler = element.props.onClick
  if (typeof handler !== 'function')
    throw new TypeError(`No click handler on ${element.tag}`)
  handler()
  await settle()
}

const button = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  },
})
const passive = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  },
})
const popover = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.reference?.())
  },
})
const dropdown = defineComponent({
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  setup(props, { slots, emit }) {
    return () => h('div', [
      slots.trigger?.().map(trigger => vue.cloneVNode(trigger, {
        'aria-expanded': props.modelValue,
        'onClick': () => emit('update:modelValue', !props.modelValue),
      })),
      props.modelValue ? h('div', { role: 'menu' }, slots.default?.()) : null,
    ])
  },
})
const dropdownItem = defineComponent({
  props: { disabled: Boolean },
  emits: ['select'],
  setup(props, { slots, emit }) {
    return () => h('button', {
      role: 'menuitem',
      disabled: props.disabled,
      onClick: () => { if (!props.disabled) emit('select') },
    }, slots.default?.())
  },
})
const bubbleMap = defineComponent({
  // The chart is an inert drawing surface, not a points-to-empty-state fake.
  setup: () => () => h('svg', { role: 'img', 'aria-label': 'Location map' }),
})

function location(latitude: number | null, longitude: number | null) {
  return { countryCode: 'US', regionCode: null, regionName: null, city: 'Seattle', latitude, longitude, updatedAt: null }
}

function login(latitude: number | null, longitude: number | null) {
  return { id: 'login-1', success: true, created_at: '2026-10-05T12:00:00Z', location: location(latitude, longitude) }
}

function device(latitude: number | null, longitude: number | null) {
  return {
    id: 'device-1',
    deviceName: 'Regression laptop',
    platform: 'macOS',
    clientType: 'app',
    trusted: false,
    trustedAt: null,
    userAgent: null,
    lastSeenAt: '2026-10-05T12:00:00Z',
    createdAt: '2026-10-01T12:00:00Z',
    revokedAt: null,
    lastLocation: location(latitude, longitude),
  }
}

const apps: App[] = []
afterEach(() => {
  for (const app of apps.splice(0))
    app.unmount()
  vi.unstubAllGlobals()
})

async function mountPage(page: 'overview' | 'devices', coordinates: [number | null, number | null]) {
  const i18n = await createRouteI18n('en')
  const translate = (key: string, values?: unknown) => i18n.t(key, typeof values === 'object' && values !== null ? values as Record<string, unknown> : {})
  vi.stubGlobal('useI18n', () => ({ t: translate, locale: ref('en') }))
  vi.stubGlobal('defineI18nRoute', () => undefined)
  vi.stubGlobal('useAuthUser', () => ({ user: ref({ name: 'Map reader' }), pending: ref(false) }))
  vi.stubGlobal('useDeviceIdentity', () => ({ deviceId: ref('device-1'), deviceName: ref('Regression laptop'), setDeviceName: vi.fn() }))

  const history = ref([login(...coordinates)])
  const devices = ref([device(...coordinates)])
  const responses: Record<string, Ref<unknown>> = {
    '/api/login-history': history,
    '/api/devices': devices,
    '/api/dashboard/telemetry/me?days=7': ref({ summary: { searches: 0, avgLatency: 0, avgResultCount: 0, lastSearchAt: null }, daily: [] }),
    '/geo/world-countries.geo.json': ref({ type: 'FeatureCollection', features: [] }),
  }
  const transport = {
    useTypedFetch: (path: string) => {
      const data = responses[path]
      if (!data)
        throw new Error(`Unexpected request: ${path}`)
      return { data, pending: ref(false), error: ref(null), refresh: async () => undefined }
    },
    requestJson: async () => { throw new Error('This location action must not mutate the account') },
  }
  const modules: Record<string, unknown> = {
    'vue': vue,
    '@talex-touch/tuffex/button': { TxButton: button },
    '@talex-touch/tuffex/checkbox': { TxCheckbox: passive },
    '@talex-touch/tuffex/charts': { TxBubbleMap: bubbleMap },
    '@talex-touch/tuffex/dropdown-menu': { TxDropdownMenu: dropdown, TxDropdownItem: dropdownItem },
    '@talex-touch/tuffex/empty-state': tuffexEmptyState,
    '@talex-touch/tuffex/input': { TuffInput: passive },
    '@talex-touch/tuffex/popover': { TxPopover: popover },
    '@talex-touch/tuffex/skeleton': { TxSkeleton: passive },
    '@talex-touch/tuffex/status-badge': { TxStatusBadge: passive },
    '~/utils/account-display': accountDisplay,
    '~/utils/request': transport,
    '~/composables/useToast': { useToast: () => ({ success: vi.fn(), error: vi.fn() }) },
    '~/components/dashboard/DashboardSparklineChart.client.vue': { default: passive },
  }
  const adapter = await loadSfcComponent('app/components/dashboard/GeoBubbleMap.client.vue', modules)
  modules['~/components/dashboard/GeoBubbleMap.client.vue'] = { default: adapter }
  const component = await loadSfcComponent(`app/pages/dashboard/${page}.vue`, modules, { transformDynamicImports: true })
  const root = node('root')
  const app = renderer.createApp(component)
  const autoImports: Record<string, Component> = {
    TxButton: button,
    TxEmptyState: tuffexEmptyState.TxEmptyState,
    TxSpinner: passive,
    TxSkeleton: passive,
    TxStatCard: passive,
  }
  for (const [name, child] of Object.entries(autoImports))
    app.component(name, child)
  apps.push(app)
  app.mount(root)
  await settle()
  return { root, history, devices, emptyTitle: translate('ui.geoMap.empty'), viewLocation: translate('dashboard.devices.viewLocation'), collapse: translate('common.collapse') }
}

function chart(root: HostNode) {
  return all(root, el => el.tag === 'svg' && el.props['aria-label'] === 'Location map')
}

function emptyMap(root: HostNode, title: string) {
  return byClass(root, 'tx-empty-state__title').filter(el => text(el) === title)
}

async function selectLocation(root: HostNode, label: string) {
  const menuItems = () => all(root, el => el.props.role === 'menuitem' && text(el) === label)
  if (!menuItems().length)
    await click(only(byClass(root, 'DashboardDevices-ActionButton')))
  await click(only(menuItems()))
}

describe('dashboard map caller visibility', () => {
  it('renders the overview map empty state when login locations have no coordinates', async () => {
    const page = await mountPage('overview', [null, null])
    expect(emptyMap(page.root, page.emptyTitle)).toHaveLength(1)
    expect(chart(page.root)).toHaveLength(0)
  })

  it('opens a coordinate-free device through the location menu action and can collapse it', async () => {
    const page = await mountPage('devices', [null, null])
    expect(emptyMap(page.root, page.emptyTitle)).toHaveLength(0)
    await selectLocation(page.root, page.viewLocation)
    const region = only(byClass(page.root, 'DashboardDevices-Map'))
    expect(emptyMap(region, page.emptyTitle)).toHaveLength(1)
    expect(chart(region)).toHaveLength(0)
    await selectLocation(page.root, page.collapse)
    expect(byClass(page.root, 'DashboardDevices-Map')).toHaveLength(0)
    expect(emptyMap(page.root, page.emptyTitle)).toHaveLength(0)
  })

  it.each(['overview', 'devices'] as const)('keeps the %s map region mounted when refreshed coordinates disappear', async (name) => {
    const page = await mountPage(name, [47.6, -122.3])
    if (name === 'devices')
      await selectLocation(page.root, page.viewLocation)
    const mapRoot = only(chart(page.root)).parent!
    const region = mapRoot.parent!
    expect(emptyMap(page.root, page.emptyTitle)).toHaveLength(0)

    page.history.value = [login(null, null)]
    page.devices.value = [device(null, null)]
    await settle()

    expect(chart(page.root)).toHaveLength(0)
    expect(emptyMap(mapRoot, page.emptyTitle)).toHaveLength(1)
    // Identity plus reachability rejects both unmount and remove/recreate fixes.
    expect(mapRoot.parent).toBe(region)
    expect(all(page.root, el => el === mapRoot)).toEqual([mapRoot])
  })
})
