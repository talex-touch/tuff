// @vitest-environment jsdom
import type { Component } from 'vue'
import { createApp, h, nextTick, ref } from 'vue'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getWidgetSandboxAuditLog } from './widget-sandbox-policy'

const transportState = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  renderers: new Map<string, Component>(),
  secureValues: new Map<string, string | null>()
}))
let handleWidgetRegister: typeof import('./widget-registry').handleWidgetRegister
let handleWidgetFailed: typeof import('./widget-registry').handleWidgetFailed
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
  getCustomRenderer: (name: string) => transportState.renderers.get(name),
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
      handleWidgetFailed,
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

  it('skips duplicate widget registration for the same widget hash', async () => {
    const payload = await register(
      'vue',
      [
        'const { h } = require("vue")',
        'module.exports = {',
        '  name: "CachedVueWidget",',
        '  setup() {',
        '    return () => h("strong", "Vue cached")',
        '  }',
        '}'
      ].join('\n')
    )
    const firstRenderer = await getRenderer(payload.widgetId)

    await handleWidgetRegister(payload)

    expect(await getRenderer(payload.widgetId)).toBe(firstRenderer)
  })

  it('removes stale renderer and styles when a registered widget later fails', async () => {
    const payload = {
      ...makePayload(
        'vue',
        [
          'const { h } = require("vue")',
          'module.exports = {',
          '  name: "StaleWidget",',
          '  setup() {',
          '    return () => h("strong", "stale")',
          '  }',
          '}'
        ].join('\n')
      ),
      styles: '.stale-widget { color: red; }'
    }

    await handleWidgetRegister(payload)
    expect(await getRenderer(payload.widgetId)).toBeDefined()
    expect(document.head.querySelector(`style[data-widget-id="${payload.widgetId}"]`)).toBeTruthy()

    handleWidgetFailed({
      widgetId: payload.widgetId,
      pluginName: payload.pluginName,
      featureId: payload.featureId,
      runtime: payload.runtime,
      runtimeStage: payload.runtimeStage,
      code: 'WIDGET_COMPILE_FAILED',
      message: 'compile failed',
      filePath: payload.filePath,
      hash: 'new-hash'
    })

    expect(transportState.renderers.has(payload.widgetId)).toBe(false)
    expect(document.head.querySelector(`style[data-widget-id="${payload.widgetId}"]`)).toBeNull()
    expect(getWidgetFailure(payload.widgetId)).toMatchObject({
      code: 'WIDGET_COMPILE_FAILED',
      hash: 'new-hash'
    })
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
      browserFacade: {
        clipboard: 'blocked-use-host-action',
        history: 'memory-isolated',
        location: 'read-only-snapshot',
        postMessage: 'widget-local',
        worker: 'blocked',
        serviceWorker: 'blocked',
        network: 'blocked-use-host-action',
        domNavigation: 'blocked'
      },
      quota: {
        windowMs: 10_000,
        maxCalls: 120,
        usedCalls: 0,
        blockedCalls: 0
      },
      audit: {
        mode: 'bounded-memory',
        maxEntries: 2_048,
        payloads: 'excluded'
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
        mode: 'guarded-new-function',
        realm: 'same-realm',
        boundary: 'host-api-containment',
        sourcePreflight: 'lexical-denylist',
        limitations: [
          'Shares JavaScript intrinsics with the host renderer',
          'Not a process, origin, or realm isolation boundary'
        ]
      }
    })
    expect(evidence.dynamicExecution.injectedGlobals).toEqual([
      'require',
      'module',
      'exports',
      'window',
      'globalThis',
      'self',
      'top',
      'parent',
      'opener',
      'frames',
      'frameElement',
      'origin',
      'localStorage',
      'sessionStorage',
      'document',
      'indexedDB',
      'BroadcastChannel',
      'caches',
      'navigator',
      'history',
      'location',
      'postMessage',
      'addEventListener',
      'removeEventListener',
      'dispatchEvent',
      'onmessage',
      'Worker',
      'SharedWorker',
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'EventSource',
      'Function',
      'eval',
      'WebAssembly',
      'importScripts',
      'open',
      'close',
      'undefined',
      'NaN',
      'Infinity',
      'Object',
      'Array',
      'Boolean',
      'Number',
      'String',
      'BigInt',
      'Symbol',
      'Date',
      'RegExp',
      'Error',
      'TypeError',
      'RangeError',
      'Map',
      'Set',
      'WeakMap',
      'WeakSet',
      'Promise',
      'Proxy',
      'Reflect',
      'JSON',
      'Math',
      'Intl',
      'ArrayBuffer',
      'DataView',
      'Uint8Array',
      'Uint16Array',
      'Uint32Array',
      'Int8Array',
      'Int16Array',
      'Int32Array',
      'Float32Array',
      'Float64Array',
      'TextEncoder',
      'TextDecoder',
      'URL',
      'URLSearchParams',
      'Blob',
      'File',
      'FormData',
      'Headers',
      'Request',
      'Response',
      'AbortController',
      'AbortSignal',
      'DOMException',
      'Event',
      'CustomEvent',
      'EventTarget',
      'MessageEvent',
      'HTMLElement',
      'Element',
      'Node',
      'DocumentFragment',
      'customElements',
      'console',
      'performance',
      'crypto',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'getComputedStyle',
      'matchMedia',
      'structuredClone'
    ])
  })

  it.each([
    ['eval', 'eval("2 + 2")'],
    ['Function', 'Function("return 2")'],
    ['dynamic import', 'import("plugin")'],
    ['WebAssembly', 'WebAssembly.compile(bytes)'],
    ['constructor escape', '({}).constructor("return 2")']
  ])('rejects %s before widget source can execute', async (_name, blockedSource) => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const payload = makePayload(
      'vue',
      ['console.log("widget-source-executed")', blockedSource, 'module.exports = {}'].join('\n')
    )

    await expect(handleWidgetRegister(payload)).rejects.toMatchObject({
      code: 'WIDGET_SANDBOX_DYNAMIC_CODE_BLOCKED'
    })
    expect(consoleLog).not.toHaveBeenCalled()
    expect(await getRenderer(payload.widgetId)).toBeUndefined()
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

  it('allows widgets to consume TuffEx AI Elements from the sandbox cache', async () => {
    const payload = {
      ...makePayload(
        'vue',
        [
          'const { h } = require("vue")',
          'const { TxAiConversation } = require("@talex-touch/tuffex/ai-elements")',
          'module.exports = { setup: () => () => h(TxAiConversation, { messages: [], emptyText: "empty" }) }'
        ].join('\n')
      ),
      dependencies: ['vue', '@talex-touch/tuffex/ai-elements']
    }

    await handleWidgetRegister(payload)

    const evidence = getWidgetSandboxEvidence(payload.widgetId)
    expect(evidence).toMatchObject({
      declaredDependencies: ['vue', '@talex-touch/tuffex/ai-elements'],
      allowedDependencies: ['vue', '@talex-touch/tuffex/ai-elements'],
      blockedDependencies: [],
      undeclaredDependencies: []
    })
  })

  it('allows widgets to consume TuffEx component subpaths from the scoped sandbox bridge', async () => {
    const payload = {
      ...makePayload(
        'vue',
        [
          'const { h } = require("vue")',
          'const { TxButton } = require("@talex-touch/tuffex/button")',
          'module.exports = { setup: () => () => h(TxButton, {}, () => "Run") }'
        ].join('\n')
      ),
      dependencies: ['vue', '@talex-touch/tuffex/button']
    }

    await handleWidgetRegister(payload)

    const evidence = getWidgetSandboxEvidence(payload.widgetId)
    expect(evidence).toMatchObject({
      declaredDependencies: ['vue', '@talex-touch/tuffex/button'],
      allowedDependencies: ['vue', '@talex-touch/tuffex/button'],
      blockedDependencies: [],
      undeclaredDependencies: []
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

  it('filters IndexedDB database names to the widget plugin namespace', async () => {
    const hostDatabases = vi.fn(async () => [
      { name: 'test-plugin::private', version: 1 },
      { name: 'other-plugin::foreign', version: 2 }
    ])
    vi.stubGlobal('indexedDB', { databases: hostDatabases })
    const payload = await register(
      'vue',
      [
        'const { h, ref } = require("vue")',
        'module.exports = {',
        '  setup() {',
        '    const names = ref("pending")',
        '    indexedDB.databases().then((databases) => {',
        '      names.value = databases.map((database) => database.name).join(",")',
        '    })',
        '    return () => h("span", names.value)',
        '  }',
        '}'
      ].join('\n')
    )

    const renderer = await getRenderer(payload.widgetId)
    const { root } = await mountRenderer(renderer, { widgetId: payload.widgetId })
    await Promise.resolve()
    await nextTick()

    expect(hostDatabases).toHaveBeenCalledTimes(1)
    expect(root.textContent).toContain('private')
    expect(root.textContent).not.toContain('foreign')
  })

  it('namespaces CacheStorage reads while denying cache network loaders with audit and quota evidence', async () => {
    const hostCacheAdd = vi.fn()
    const hostCacheAddAll = vi.fn()
    const hostCache = { add: hostCacheAdd, addAll: hostCacheAddAll }
    let resolveCacheMatches!: () => void
    const cacheMatchesFinished = new Promise<void>((resolve) => {
      resolveCacheMatches = resolve
    })
    let cacheMatchCalls = 0
    const hostCacheMatch = vi.fn(async () => {
      cacheMatchCalls += 1
      if (cacheMatchCalls === 2) resolveCacheMatches()
      return undefined
    })
    const hostCaches = {
      open: vi.fn(async () => hostCache),
      keys: vi.fn(async () => ['test-plugin::owned', 'other-plugin::foreign']),
      match: hostCacheMatch
    }
    vi.stubGlobal('caches', hostCaches)
    const payload = await register(
      'vue',
      [
        'const { h, ref } = require("vue")',
        'module.exports = {',
        '  setup() {',
        '    const status = ref("pending")',
        '    void (async () => {',
        '      const cache = await caches.open("owned")',
        '      let blocked = 0',
        '      try { await cache.add("/network") } catch { blocked += 1 }',
        '      try { await cache.addAll(["/network-a", "/network-b"]) } catch { blocked += 1 }',
        '      const names = await caches.keys()',
        '      await caches.match("/entry", { cacheName: "owned" })',
        '      await caches.match("/entry")',
        '      status.value = `${names.join(",")}:${blocked}`',
        '    })()',
        '    return () => h("span", status.value)',
        '  }',
        '}'
      ].join('\n')
    )

    const renderer = await getRenderer(payload.widgetId)
    await mountRenderer(renderer, { widgetId: payload.widgetId })
    await cacheMatchesFinished

    expect(hostCaches.open).toHaveBeenCalledWith('test-plugin::owned')
    expect(hostCaches.keys).toHaveBeenCalledTimes(2)
    expect(hostCacheMatch).toHaveBeenCalledTimes(2)
    expect(hostCacheMatch.mock.calls).toEqual([
      ['/entry', expect.objectContaining({ cacheName: 'test-plugin::owned' })],
      ['/entry', expect.objectContaining({ cacheName: 'test-plugin::owned' })]
    ])
    expect(hostCacheAdd).not.toHaveBeenCalled()
    expect(hostCacheAddAll).not.toHaveBeenCalled()
    expect(getWidgetSandboxAuditLog(payload.widgetId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: 'network.access', decision: 'denied' })
      ])
    )
    expect(getWidgetSandboxEvidence(payload.widgetId)?.quota).toMatchObject({
      usedCalls: 3,
      blockedCalls: 2
    })
  })

  it('namespaces BroadcastChannel delivery and charges postMessage to widget quota and audit', async () => {
    const channelNames: string[] = []
    const hostPostMessage = vi.fn()
    class HostBroadcastChannel {
      constructor(name: string) {
        channelNames.push(name)
      }

      postMessage(message: unknown): void {
        hostPostMessage(message)
      }
    }
    vi.stubGlobal('BroadcastChannel', HostBroadcastChannel)
    const payload = await register(
      'vue',
      [
        'const { h } = require("vue")',
        'const channel = new BroadcastChannel("updates")',
        'channel.postMessage({ type: "widget-update" })',
        'module.exports = { setup: () => () => h("span", "broadcast") }'
      ].join('\n')
    )

    expect(channelNames).toEqual(['test-plugin::updates'])
    expect(hostPostMessage).toHaveBeenCalledWith({ type: 'widget-update' })
    expect(getWidgetSandboxAuditLog(payload.widgetId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: 'postMessage',
          decision: 'allowed',
          reason: 'plugin-namespaced-broadcast'
        })
      ])
    )
    expect(getWidgetSandboxEvidence(payload.widgetId)?.quota).toMatchObject({
      usedCalls: 2,
      blockedCalls: 0
    })
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

  it('mounts Arrow widgets, reacts to payload changes, and runs cleanup through its passed host action', async () => {
    const hostAction = vi.fn()
    const payload = await register(
      'arrow',
      [
        'const { component, html, onCleanup } = require("@arrow-js/core")',
        'module.exports = component((props) => {',
        '  onCleanup(() => props.onHostAction({ actionId: "widget-cleanup" }))',
        '  return html`<span>${() => props.payload?.title || "Arrow"}</span>`',
        '})'
      ].join('\n')
    )

    const renderer = await getRenderer(payload.widgetId)
    expect(renderer).toBeDefined()

    const title = ref('Arrow ok')
    const { root, app } = await mountFactory(() =>
      h(renderer, {
        payload: { title: title.value },
        widgetId: payload.widgetId,
        onHostAction: hostAction
      })
    )

    await nextTick()
    expect(root.textContent).toContain('Arrow ok')
    title.value = 'Arrow updated'
    await nextTick()
    await Promise.resolve()
    expect(root.textContent).toContain('Arrow updated')

    app.unmount()
    await nextTick()
    expect(hostAction).toHaveBeenCalledWith({ actionId: 'widget-cleanup' })
  })
})
