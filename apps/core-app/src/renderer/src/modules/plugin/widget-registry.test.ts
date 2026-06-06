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
let buildWidgetSandboxEvidence: typeof import('./widget-registry').buildWidgetSandboxEvidence
let getWidgetFailure: typeof import('./widget-registry').getWidgetFailure
let getWidgetSandboxEvidence: typeof import('./widget-registry').getWidgetSandboxEvidence

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
    ;({
      buildWidgetSandboxEvidence,
      getWidgetFailure,
      getWidgetSandboxEvidence,
      handleWidgetRegister
    } = await import('./widget-registry'))
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

  it('builds widget sandbox evidence for the runtime boundary', () => {
    const payload = makePayload(
      'vue',
      'const { h } = require("vue"); module.exports = { setup: () => () => h("span") }'
    )

    const evidence = buildWidgetSandboxEvidence(payload)

    expect(evidence).toMatchObject({
      widgetId: payload.widgetId,
      pluginName: payload.pluginName,
      featureId: payload.featureId,
      runtime: 'vue',
      runtimeStage: 'stable',
      sourceType: 'js',
      hash: payload.hash,
      declaredDependencies: ['vue'],
      allowedDependencies: ['vue'],
      blockedDependencies: [],
      undeclaredDependencies: [],
      storageFacade: {
        localStorage: 'secure-namespaced',
        sessionStorage: 'memory-namespaced',
        cookies: 'secure-namespaced',
        indexedDB: 'plugin-namespaced',
        caches: 'plugin-namespaced',
        broadcastChannel: 'plugin-namespaced'
      },
      windowBoundary: {
        opener: 'null',
        top: 'sandbox-proxy',
        parent: 'sandbox-proxy',
        self: 'sandbox-proxy',
        globalThis: 'sandbox-proxy',
        documentDefaultView: 'sandbox-proxy'
      },
      dynamicExecution: {
        mode: 'new-function'
      }
    })
    expect(evidence.dynamicExecution.injectedGlobals).toEqual([
      'require',
      'module',
      'exports',
      'window',
      'globalThis',
      'localStorage',
      'sessionStorage',
      'document',
      'indexedDB',
      'BroadcastChannel',
      'caches',
      'self'
    ])
  })

  it('records sandbox evidence when widget code requires an undeclared module', async () => {
    const payload = {
      ...makePayload(
        'vue',
        [
          'require("@talex-touch/utils")',
          'const { h } = require("vue")',
          'module.exports = { setup: () => () => h("span", "unreachable") }'
        ].join('\n')
      ),
      dependencies: ['vue']
    }

    await expect(handleWidgetRegister(payload)).rejects.toThrow(
      'Module "@talex-touch/utils" is not allowed'
    )

    const evidence = getWidgetSandboxEvidence(payload.widgetId)
    expect(evidence?.undeclaredDependencies).toEqual(['@talex-touch/utils'])
    expect(getWidgetFailure(payload.widgetId)).toMatchObject({
      code: 'WIDGET_RUNTIME_REGISTER_FAILED',
      sandboxEvidence: {
        undeclaredDependencies: ['@talex-touch/utils'],
        allowedDependencies: ['vue']
      }
    })
  })

  it('blocks declared dependencies that are outside the widget allowlist', async () => {
    const payload = {
      ...makePayload(
        'vue',
        [
          'const { h } = require("vue")',
          'module.exports = { setup: () => () => h("span", "unreachable") }'
        ].join('\n')
      ),
      dependencies: ['vue', 'fs']
    }

    await expect(handleWidgetRegister(payload)).rejects.toThrow('dependencies not available: fs')

    const evidence = getWidgetSandboxEvidence(payload.widgetId)
    expect(evidence).toMatchObject({
      declaredDependencies: ['vue', 'fs'],
      allowedDependencies: ['vue'],
      blockedDependencies: ['fs'],
      undeclaredDependencies: []
    })
    expect(getWidgetFailure(payload.widgetId)?.sandboxEvidence?.blockedDependencies).toEqual(['fs'])
  })

  it('isolates storage and cookies per plugin/widget sandbox', async () => {
    const writer = {
      ...makePayload(
        'vue',
        [
          'const { h } = require("vue")',
          'localStorage.setItem("token", "plugin-a-token")',
          'document.cookie = "sid=plugin-a-cookie"',
          'module.exports = { setup: () => () => h("span", "writer") }'
        ].join('\n')
      ),
      pluginName: 'plugin-a',
      widgetId: 'plugin-a::vue'
    }
    const reader = {
      ...makePayload(
        'vue',
        [
          'const { h } = require("vue")',
          'const seen = localStorage.getItem("token") || document.cookie || "isolated"',
          'module.exports = { setup: () => () => h("span", seen) }'
        ].join('\n')
      ),
      pluginName: 'plugin-b',
      widgetId: 'plugin-b::vue'
    }

    await handleWidgetRegister(writer)
    await handleWidgetRegister(reader)

    expect(window.localStorage.getItem('token')).toBeNull()
    expect(document.cookie).not.toContain('plugin-a-cookie')

    const renderer = await getRenderer(reader.widgetId)
    const { root } = await mountRenderer(renderer, { widgetId: reader.widgetId })

    expect(root.textContent).toContain('isolated')
  })

  it('injects sandbox window and document boundaries instead of real escape handles', async () => {
    const payload = await register(
      'vue',
      [
        'const { h } = require("vue")',
        'const isSandboxed = window.opener === null',
        '  && window.top === window',
        '  && window.parent === window',
        '  && window.self === window',
        '  && globalThis === window',
        '  && document.defaultView === window',
        'module.exports = { setup: () => () => h("span", isSandboxed ? "sandboxed" : "leaked") }'
      ].join('\n')
    )

    const renderer = await getRenderer(payload.widgetId)
    const { root } = await mountRenderer(renderer, { widgetId: payload.widgetId })

    expect(root.textContent).toContain('sandboxed')
    expect(getWidgetSandboxEvidence(payload.widgetId)?.windowBoundary).toMatchObject({
      opener: 'null',
      top: 'sandbox-proxy',
      parent: 'sandbox-proxy',
      self: 'sandbox-proxy',
      globalThis: 'sandbox-proxy',
      documentDefaultView: 'sandbox-proxy'
    })
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
