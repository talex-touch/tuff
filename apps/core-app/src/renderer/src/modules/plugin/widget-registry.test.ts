// @vitest-environment jsdom
import type { Component } from 'vue'
import { createApp, h, nextTick, ref } from 'vue'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const transportState = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  renderers: new Map<string, Component>(),
  secureValues: new Map<string, string | null>()
}))
let handleWidgetRegister: typeof import('./widget-registry').handleWidgetRegister

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: (event: string, handler: Function) => {
      transportState.handlers.set(event, handler)
      return () => transportState.handlers.delete(event)
    },
    send: vi.fn(async (event: string, payload: { key?: string; value?: string | null }) => {
      if (event === 'app:system:get-secure-value') {
        return payload.key ? transportState.secureValues.get(payload.key) : null
      }
      if (event === 'app:system:set-secure-value' && payload.key) {
        transportState.secureValues.set(payload.key, payload.value ?? null)
      }
      return null
    })
  })
}))

vi.mock('../box/custom-render', () => ({
  registerCustomRenderer: (name: string, component: Component) => {
    transportState.renderers.set(name, component)
  },
  unregisterCustomRenderer: (name: string) => {
    transportState.renderers.delete(name)
  }
}))

vi.mock('../../utils/dev-log', () => ({
  devLog: vi.fn()
}))

vi.mock('../../utils/renderer-log', () => ({
  createRendererLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  })
}))

function makePayload(runtime: 'vue' | 'webcomponent' | 'arrow', code: string) {
  return {
    code,
    dependencies: runtime === 'arrow' ? ['@arrow-js/core'] : runtime === 'vue' ? ['vue'] : [],
    featureId: `${runtime}.feature`,
    filePath: `/plugin/widgets/${runtime}.js`,
    hash: `${runtime}-hash`,
    pluginName: 'test-plugin',
    runtime,
    runtimeStage: runtime === 'vue' ? 'stable' : 'beta',
    styles: '',
    widgetId: `test-plugin::${runtime}`
  } as const
}

async function register(runtime: 'vue' | 'webcomponent' | 'arrow', code: string) {
  const payload = makePayload(runtime, code)
  await handleWidgetRegister(payload)
  return payload
}

async function getRenderer(widgetId: string): Promise<Component> {
  return transportState.renderers.get(widgetId) as Component
}

async function mountFactory(render: () => ReturnType<typeof h>) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = createApp(() => render())
  app.mount(root)
  await nextTick()
  return { app, root }
}

async function mountRenderer(component: Component, props: Record<string, unknown> = {}) {
  return mountFactory(() => h(component, props))
}

describe('widget-registry runtime hosts', () => {
  beforeAll(async () => {
    ;({ handleWidgetRegister } = await import('./widget-registry'))
  }, 10000)

  beforeEach(() => {
    transportState.handlers.clear()
    transportState.renderers.clear()
    transportState.secureValues.clear()
    document.body.replaceChildren()
    document.head.querySelectorAll('style[data-widget-id]').forEach((node) => node.remove())
  })

  afterEach(() => {
    document.body.replaceChildren()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('registers Vue widgets without changing the existing renderer path', async () => {
    const payload = await register(
      'vue',
      [
        'const { h } = require("vue")',
        'module.exports = {',
        '  name: "VueWidget",',
        '  setup() {',
        '    return () => h("strong", "Vue ok")',
        '  }',
        '}'
      ].join('\n')
    )

    const renderer = await getRenderer(payload.widgetId)
    expect(renderer).toBeDefined()
    expect(renderer).toMatchObject({ name: 'VueWidget' })
  })

  it('passes host props to WebComponent widgets as DOM properties and cleans up on unmount', async () => {
    const payload = await register(
      'webcomponent',
      [
        'class DemoTouchWidget extends HTMLElement {',
        '  set payload(value) { this._payload = value; this.textContent = value?.title || "" }',
        '  get payload() { return this._payload }',
        '}',
        'module.exports = DemoTouchWidget'
      ].join('\n')
    )

    const renderer = await getRenderer(payload.widgetId)
    expect(renderer).toBeDefined()

    const { root, app } = await mountRenderer(renderer, {
      payload: { title: 'WebComponent ok' },
      widgetId: payload.widgetId
    })
    const element = root.querySelector('tuff-widget-demo-touch-widget') as HTMLElement & {
      payload?: { title: string }
      widgetId?: string
    }

    expect(element).toBeTruthy()
    expect(element.payload?.title).toBe('WebComponent ok')
    expect(element.widgetId).toBe(payload.widgetId)
    expect(root.textContent).toContain('WebComponent ok')

    app.unmount()
    expect(root.querySelector('tuff-widget-demo-touch-widget')).toBeNull()
  })

  it('mounts Arrow widgets, reacts to payload changes, and runs Arrow cleanup on unmount', async () => {
    const cleanup = vi.fn()
    vi.stubGlobal('__arrowWidgetCleanup', cleanup)
    const payload = await register(
      'arrow',
      [
        'const { component, html, onCleanup } = require("@arrow-js/core")',
        'module.exports = component((props) => {',
        '  onCleanup(() => window.__arrowWidgetCleanup())',
        '  return html`<span>${() => props.payload?.title || "Arrow"}</span>`',
        '})'
      ].join('\n')
    )

    const renderer = await getRenderer(payload.widgetId)
    expect(renderer).toBeDefined()

    const title = ref('Arrow ok')
    const { root, app } = await mountFactory(() =>
      h(renderer, { payload: { title: title.value }, widgetId: payload.widgetId })
    )

    await nextTick()
    expect(root.textContent).toContain('Arrow ok')
    title.value = 'Arrow updated'
    await nextTick()
    await Promise.resolve()
    expect(root.textContent).toContain('Arrow updated')

    app.unmount()
    await nextTick()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
