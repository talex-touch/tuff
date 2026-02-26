import type { WidgetRegistrationPayload } from '@talex-touch/utils/plugin/widget'
import type { Component, ComponentPublicInstance, SetupContext } from 'vue'
import * as TalexUtils from '@talex-touch/utils'
import * as TalexUtilsChannel from '@talex-touch/utils/channel'
import * as TalexUtilsCommon from '@talex-touch/utils/common'
import * as TalexUtilsCoreBox from '@talex-touch/utils/core-box'
import * as TalexUtilsPlugin from '@talex-touch/utils/plugin'
import * as TalexUtilsPluginSdk from '@talex-touch/utils/plugin/sdk'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { tryUseChannel } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents, PluginEvents } from '@talex-touch/utils/transport/events'
import * as TalexUtilsTypes from '@talex-touch/utils/types'
import * as Vue from 'vue'
import { registerCustomRenderer, unregisterCustomRenderer } from '~/modules/box/custom-render'
import { devLog } from '~/utils/dev-log'

const injectedStyles = new Map<string, HTMLStyleElement>()
const widgetRuntimeSources = new Map<string, string[]>()

function cacheWidgetRuntimeSource(widgetId: string | undefined, code: string): void {
  if (!widgetId) return
  widgetRuntimeSources.set(widgetId, code.split('\n'))
}

function clearWidgetRuntimeSource(widgetId?: string): void {
  if (!widgetId) return
  widgetRuntimeSources.delete(widgetId)
}

export function getWidgetRuntimeSnippet(
  widgetId: string,
  line: number,
  radius = 2
): Array<{ line: number; text: string }> {
  const lines = widgetRuntimeSources.get(widgetId)
  if (!lines || !Number.isFinite(line) || line <= 0) return []
  const start = Math.max(1, line - radius)
  const end = Math.min(lines.length, line + radius)
  const result: Array<{ line: number; text: string }> = []
  for (let current = start; current <= end; current += 1) {
    result.push({
      line: current,
      text: lines[current - 1] ?? ''
    })
  }
  return result
}
const transport = useTuffTransport()
const widgetRegisterEvent = PluginEvents.widget.register
const widgetUpdateEvent = PluginEvents.widget.update
const widgetUnregisterEvent = PluginEvents.widget.unregister
const isDev = import.meta.env?.DEV ?? false
const pollingService = PollingService.getInstance()
let transportBindingsReady = false
let transportBindingTaskId: string | null = null

const WIDGET_STORAGE_FLUSH_MS = 250
const WIDGET_STORAGE_MAX_BYTES = 512 * 1024
const WIDGET_STORAGE_ENTRY_MAX_BYTES = 64 * 1024
const WIDGET_STORAGE_SECURE_PREFIX = 'widget.storage.'
const WIDGET_STORAGE_SECURE_KEY_MAX = 80
const WIDGET_STORAGE_SECURE_NAME_MAX = Math.max(
  8,
  WIDGET_STORAGE_SECURE_KEY_MAX - WIDGET_STORAGE_SECURE_PREFIX.length
)

type WidgetStorageState = {
  local: Map<string, Map<string, string>>
  session: Map<string, Map<string, string>>
  cookies: Map<string, Map<string, string>>
  loaded: boolean
  loading?: Promise<void>
  flushTimer?: number
}

const widgetStorageState = new Map<string, WidgetStorageState>()

function resolveStorageKey(pluginName?: string): string {
  return pluginName?.trim() || 'unknown'
}

function resolveSecureStorageKey(pluginName?: string): string | null {
  const name = pluginName?.trim()
  if (!name) {
    return null
  }
  const safe = name.replace(/[^a-z0-9._-]/gi, '_') || 'unknown'
  if (safe.length <= WIDGET_STORAGE_SECURE_NAME_MAX) {
    return `${WIDGET_STORAGE_SECURE_PREFIX}${safe}`
  }
  let hash = 0
  for (let i = 0; i < safe.length; i += 1) {
    hash = (hash * 31 + safe.charCodeAt(i)) >>> 0
  }
  const hashSuffix = hash.toString(36)
  const maxHashLength = Math.max(1, WIDGET_STORAGE_SECURE_NAME_MAX - 2)
  const trimmedHash = hashSuffix.slice(0, maxHashLength)
  const headLength = Math.max(1, WIDGET_STORAGE_SECURE_NAME_MAX - trimmedHash.length - 1)
  const head = safe.slice(0, headLength)
  return `${WIDGET_STORAGE_SECURE_PREFIX}${head}-${trimmedHash}`
}

function getStorageState(pluginName?: string): WidgetStorageState {
  const key = resolveStorageKey(pluginName)
  const existing = widgetStorageState.get(key)
  if (existing) {
    return existing
  }
  const created: WidgetStorageState = {
    local: new Map(),
    session: new Map(),
    cookies: new Map(),
    loaded: false
  }
  widgetStorageState.set(key, created)
  return created
}

function getWidgetStore(
  map: Map<string, Map<string, string>>,
  widgetId: string
): Map<string, string> {
  const existing = map.get(widgetId)
  if (existing) {
    return existing
  }
  const store = new Map<string, string>()
  map.set(widgetId, store)
  return store
}

function estimateEntrySize(key: string, value: string): number {
  return key.length + value.length
}

function estimateStoreSize(store: Map<string, string>): number {
  let total = 0
  store.forEach((value, key) => {
    total += estimateEntrySize(key, value)
  })
  return total
}

function estimatePluginLocalSize(state: WidgetStorageState): number {
  let total = 0
  state.local.forEach((store) => {
    total += estimateStoreSize(store)
  })
  state.cookies.forEach((store) => {
    total += estimateStoreSize(store)
  })
  return total
}

function toRecord(store: Map<string, string>): Record<string, string> {
  const record: Record<string, string> = {}
  store.forEach((value, key) => {
    record[key] = value
  })
  return record
}

function applyRecord(store: Map<string, string>, record: unknown): void {
  if (!record || typeof record !== 'object') {
    return
  }
  Object.entries(record as Record<string, unknown>).forEach(([key, value]) => {
    if (typeof value === 'string') {
      store.set(key, value)
    }
  })
}

function deserializeStorageState(state: WidgetStorageState, payload: unknown): void {
  if (!payload || typeof payload !== 'object') {
    return
  }
  const root = payload as Record<string, unknown>
  Object.entries(root).forEach(([widgetId, value]) => {
    if (!value || typeof value !== 'object') {
      return
    }
    const block = value as Record<string, unknown>
    const localStore = getWidgetStore(state.local, widgetId)
    const cookieStore = getWidgetStore(state.cookies, widgetId)
    if (block.local && typeof block.local === 'object') {
      applyRecord(localStore, block.local)
    } else {
      applyRecord(localStore, block)
    }
    if (block.cookies && typeof block.cookies === 'object') {
      applyRecord(cookieStore, block.cookies)
    }
  })
}

function serializeStorageState(state: WidgetStorageState): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  state.local.forEach((store, widgetId) => {
    const cookies = state.cookies.get(widgetId)
    const record: Record<string, unknown> = { local: toRecord(store) }
    if (cookies && cookies.size > 0) {
      record.cookies = toRecord(cookies)
    }
    payload[widgetId] = record
  })
  return payload
}

async function ensureLocalStorageLoaded(pluginName?: string): Promise<void> {
  const key = resolveStorageKey(pluginName)
  const state = getStorageState(key)
  if (state.loaded) {
    return
  }
  if (!pluginName) {
    state.loaded = true
    return
  }
  if (state.loading) {
    return state.loading
  }

  state.loading = (async () => {
    try {
      const secureKey = resolveSecureStorageKey(pluginName)
      if (!secureKey) {
        return
      }
      const raw = await transport.send(AppEvents.system.getSecureValue, { key: secureKey })
      if (!raw) {
        return
      }
      const parsed = JSON.parse(raw)
      deserializeStorageState(state, parsed)
    } catch (error) {
      if (isDev) {
        console.warn('[WidgetRegistry] Failed to load widget storage', error)
      }
    } finally {
      state.loaded = true
      state.loading = undefined
    }
  })()

  return state.loading
}

function scheduleLocalStorageFlush(pluginName?: string): void {
  if (!pluginName) {
    return
  }
  const secureKey = resolveSecureStorageKey(pluginName)
  if (!secureKey) {
    return
  }
  const key = resolveStorageKey(pluginName)
  const state = getStorageState(key)
  if (state.flushTimer) {
    return
  }

  state.flushTimer = window.setTimeout(() => {
    state.flushTimer = undefined
    const payload = serializeStorageState(state)
    const value = Object.keys(payload).length > 0 ? JSON.stringify(payload) : null
    transport
      .send(AppEvents.system.setSecureValue, {
        key: secureKey,
        value
      })
      .catch(() => {})
  }, WIDGET_STORAGE_FLUSH_MS)
}

function withinLocalStorageQuota(nextSize: number): boolean {
  return nextSize <= WIDGET_STORAGE_MAX_BYTES
}

function createStorageFacade(
  type: 'local' | 'session',
  pluginName?: string,
  widgetId?: string
): Storage {
  const key = resolveStorageKey(pluginName)
  const state = getStorageState(key)
  const id = widgetId || 'unknown'
  const map = type === 'local' ? state.local : state.session
  const store = getWidgetStore(map, id)

  const persistIfNeeded = () => {
    if (type === 'local') {
      scheduleLocalStorageFlush(key)
    }
  }

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
      persistIfNeeded()
    },
    getItem(itemKey: string) {
      return store.has(itemKey) ? store.get(itemKey)! : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(itemKey: string) {
      if (store.delete(itemKey)) {
        persistIfNeeded()
      }
    },
    setItem(itemKey: string, value: string) {
      const nextValue = String(value)
      if (nextValue.length > WIDGET_STORAGE_ENTRY_MAX_BYTES) {
        console.warn('[WidgetRegistry] Storage entry too large, ignoring setItem')
        return
      }
      const previousValue = store.get(itemKey)
      store.set(itemKey, nextValue)
      if (type === 'local') {
        const nextSize = estimatePluginLocalSize(state)
        if (!withinLocalStorageQuota(nextSize)) {
          if (previousValue === undefined) {
            store.delete(itemKey)
          } else {
            store.set(itemKey, previousValue)
          }
          console.warn('[WidgetRegistry] Storage quota exceeded, ignoring setItem')
          return
        }
      }
      persistIfNeeded()
    }
  } as Storage
}

function parseCookieValue(value: string): { key: string; value: string } | null {
  const [pair] = value.split(';')
  if (!pair) return null
  const index = pair.indexOf('=')
  if (index <= 0) return null
  const key = pair.slice(0, index).trim()
  const val = pair.slice(index + 1).trim()
  if (!key) return null
  return { key, value: val }
}

function stringifyCookies(store: Map<string, string>): string {
  return Array.from(store.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('; ')
}

function createSandboxDocument(
  pluginName?: string,
  widgetId?: string,
  getSandboxWindow?: () => Window | undefined
): Document {
  const key = resolveStorageKey(pluginName)
  const state = getStorageState(key)
  const cookieStore = getWidgetStore(state.cookies, widgetId || 'unknown')
  const boundMethodCache = new Map<PropertyKey, Function>()
  return new Proxy(document, {
    get(target, prop) {
      if (prop === 'cookie') {
        return stringifyCookies(cookieStore)
      }
      if (prop === 'defaultView' || prop === 'parentWindow' || prop === 'window') {
        return getSandboxWindow?.() ?? null
      }
      const value = Reflect.get(target, prop, target)
      if (typeof value === 'function') {
        const cached = boundMethodCache.get(prop)
        if (cached) {
          return cached
        }
        const bound = value.bind(target)
        boundMethodCache.set(prop, bound)
        return bound
      }
      return value
    },
    set(target, prop, value, receiver) {
      if (prop === 'cookie') {
        const parsed = parseCookieValue(String(value ?? ''))
        if (parsed) {
          const nextValue = parsed.value
          if (nextValue.length > WIDGET_STORAGE_ENTRY_MAX_BYTES) {
            console.warn('[WidgetRegistry] Cookie entry too large, ignoring set')
            return true
          }
          const previousValue = cookieStore.get(parsed.key)
          cookieStore.set(parsed.key, nextValue)
          const nextSize = estimatePluginLocalSize(state)
          if (!withinLocalStorageQuota(nextSize)) {
            if (previousValue === undefined) {
              cookieStore.delete(parsed.key)
            } else {
              cookieStore.set(parsed.key, previousValue)
            }
            console.warn('[WidgetRegistry] Storage quota exceeded, ignoring cookie set')
            return true
          }
          scheduleLocalStorageFlush(pluginName)
        }
        return true
      }
      return Reflect.set(target, prop, value, receiver)
    }
  })
}

function createNamespacedIndexedDB(pluginName?: string): IDBFactory {
  if (typeof indexedDB === 'undefined') {
    return {} as IDBFactory
  }
  const prefix = `${resolveStorageKey(pluginName)}::`
  return new Proxy(indexedDB, {
    get(target, prop, receiver) {
      if (prop === 'open') {
        return (name: string, version?: number) =>
          typeof version === 'number'
            ? target.open(`${prefix}${name}`, version)
            : target.open(`${prefix}${name}`)
      }
      if (prop === 'deleteDatabase') {
        return (name: string) => target.deleteDatabase(`${prefix}${name}`)
      }
      return Reflect.get(target, prop, receiver)
    }
  })
}

function createNamespacedCacheStorage(pluginName?: string): CacheStorage {
  if (typeof caches === 'undefined') {
    return {} as CacheStorage
  }
  const prefix = `${resolveStorageKey(pluginName)}::`
  return new Proxy(caches, {
    get(target, prop, receiver) {
      if (prop === 'open') {
        return (name: string) => target.open(`${prefix}${name}`)
      }
      if (prop === 'delete') {
        return (name: string) => target.delete(`${prefix}${name}`)
      }
      if (prop === 'has') {
        return (name: string) => target.has(`${prefix}${name}`)
      }
      return Reflect.get(target, prop, receiver)
    }
  })
}

function createNamespacedBroadcastChannel(pluginName?: string): typeof BroadcastChannel {
  if (typeof BroadcastChannel === 'undefined') {
    return class WidgetBroadcastChannel {
      constructor() {
        throw new Error('[WidgetSandbox] BroadcastChannel is not available')
      }
    } as typeof BroadcastChannel
  }
  const prefix = `${resolveStorageKey(pluginName)}::`
  return class WidgetBroadcastChannel extends BroadcastChannel {
    constructor(name: string) {
      super(`${prefix}${name}`)
    }
  }
}

function createSandboxWindow(
  pluginName?: string,
  widgetId?: string,
  sandboxDocument?: Document,
  sandboxIndexedDB?: IDBFactory,
  sandboxBroadcastChannel?: typeof BroadcastChannel,
  sandboxCaches?: CacheStorage,
  localStorage?: Storage,
  sessionStorage?: Storage
): Window {
  const local = localStorage ?? createStorageFacade('local', pluginName, widgetId)
  const session = sessionStorage ?? createStorageFacade('session', pluginName, widgetId)
  const doc = sandboxDocument ?? createSandboxDocument(pluginName, widgetId)
  const indexed = sandboxIndexedDB ?? createNamespacedIndexedDB(pluginName)
  const bc = sandboxBroadcastChannel ?? createNamespacedBroadcastChannel(pluginName)
  const cacheStorage = sandboxCaches ?? createNamespacedCacheStorage(pluginName)
  const boundMethodCache = new Map<PropertyKey, Function>()

  return new Proxy(window, {
    get(target, prop, receiver) {
      if (
        prop === 'window' ||
        prop === 'self' ||
        prop === 'top' ||
        prop === 'parent' ||
        prop === 'globalThis'
      ) {
        return receiver
      }
      if (prop === 'opener') {
        return null
      }
      if (prop === 'localStorage') return local
      if (prop === 'sessionStorage') return session
      if (prop === 'document') return doc
      if (prop === 'indexedDB') return indexed
      if (prop === 'BroadcastChannel') return bc
      if (prop === 'caches') return cacheStorage
      const value = Reflect.get(target, prop, target)
      if (typeof value === 'function') {
        const cached = boundMethodCache.get(prop)
        if (cached) {
          return cached
        }
        const bound = value.bind(target)
        boundMethodCache.set(prop, bound)
        return bound
      }
      return value
    },
    set(target, prop, value, receiver) {
      if (
        prop === 'window' ||
        prop === 'self' ||
        prop === 'top' ||
        prop === 'parent' ||
        prop === 'globalThis' ||
        prop === 'opener' ||
        prop === 'localStorage' ||
        prop === 'sessionStorage' ||
        prop === 'document' ||
        prop === 'indexedDB' ||
        prop === 'BroadcastChannel' ||
        prop === 'caches'
      ) {
        return true
      }
      return Reflect.set(target, prop, value, receiver)
    }
  })
}

type WidgetSandboxContext = {
  window: Window
  globalThis: Window
  localStorage: Storage
  sessionStorage: Storage
  document: Document
  indexedDB: IDBFactory
  BroadcastChannel: typeof BroadcastChannel
  caches: CacheStorage
  self: Window
}

async function createWidgetSandbox(
  pluginName?: string,
  widgetId?: string
): Promise<WidgetSandboxContext> {
  await ensureLocalStorageLoaded(pluginName)
  const localStorage = createStorageFacade('local', pluginName, widgetId)
  const sessionStorage = createStorageFacade('session', pluginName, widgetId)
  let sandboxWindow: Window | undefined
  const document = createSandboxDocument(pluginName, widgetId, () => sandboxWindow)
  const indexedDB = createNamespacedIndexedDB(pluginName)
  const BroadcastChannel = createNamespacedBroadcastChannel(pluginName)
  const caches = createNamespacedCacheStorage(pluginName)
  sandboxWindow = createSandboxWindow(
    pluginName,
    widgetId,
    document,
    indexedDB,
    BroadcastChannel,
    caches,
    localStorage,
    sessionStorage
  )
  return {
    window: sandboxWindow,
    globalThis: sandboxWindow,
    localStorage,
    sessionStorage,
    document,
    indexedDB,
    BroadcastChannel,
    caches,
    self: sandboxWindow
  }
}

function resolveWidgetSourceType(filePath?: string): string {
  if (!filePath) return 'unknown'
  const clean = filePath.split('?')[0]?.split('#')[0] ?? ''
  const match = /\.([a-zA-Z0-9]+)$/.exec(clean)
  return match ? match[1].toLowerCase() : 'unknown'
}

// List of allowed packages that can be used in widgets
const ALLOWED_PACKAGES = [
  'vue',
  '@talex-touch/utils',
  '@talex-touch/utils/plugin',
  '@talex-touch/utils/plugin/sdk',
  '@talex-touch/utils/core-box',
  '@talex-touch/utils/channel',
  '@talex-touch/utils/common',
  '@talex-touch/utils/types'
]

// Pre-loaded module cache using ES imports
const preloadedModuleCache: Record<string, unknown> = {
  vue: Vue,
  '@talex-touch/utils': TalexUtils,
  '@talex-touch/utils/plugin': TalexUtilsPlugin,
  '@talex-touch/utils/plugin/sdk': TalexUtilsPluginSdk,
  '@talex-touch/utils/core-box': TalexUtilsCoreBox,
  '@talex-touch/utils/channel': TalexUtilsChannel,
  '@talex-touch/utils/common': TalexUtilsCommon,
  '@talex-touch/utils/types': TalexUtilsTypes
}

type PluginInjectedInstance = ComponentPublicInstance & { $plugin?: Record<string, unknown> }

type WidgetSetup = (props: Record<string, unknown>, ctx: SetupContext) => unknown

type WidgetComponent = {
  setup?: WidgetSetup
  beforeCreate?: (this: PluginInjectedInstance) => void
  __pluginInjected?: boolean
} & Record<string, unknown>

type WidgetFunctionalComponent = (props: Record<string, unknown>, ctx: SetupContext) => unknown

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function describeExportShape(value: unknown): Record<string, unknown> {
  if (!value) return { type: String(value) }
  const type = typeof value
  if (type !== 'object' && type !== 'function') return { type }
  const keys = isObjectLike(value) ? Object.keys(value) : []
  const named = value as { name?: string; __name?: string; render?: unknown; setup?: unknown }
  return {
    type,
    keys,
    name: named.name || named.__name || 'anonymous',
    hasRender: typeof named.render === 'function',
    hasSetup: typeof named.setup === 'function'
  }
}

function normalizeWidgetExport(exported: unknown, renderExport?: unknown): unknown {
  if (!exported || (typeof exported !== 'object' && typeof exported !== 'function')) {
    return exported
  }
  if (typeof exported !== 'object') {
    return exported
  }

  const target = exported as Record<string, unknown>
  if (typeof renderExport !== 'function') {
    return target
  }
  if (typeof target.render === 'function') {
    return target
  }
  if (Object.isExtensible(target)) {
    target.render = renderExport
    return target
  }

  if (isDev) {
    devLog(
      '[WidgetRegistry] component not extensible, wrapping render',
      describeExportShape(target)
    )
  }

  return Vue.defineComponent({
    ...(target as Record<string, unknown>),
    render: renderExport
  })
}

function wrapRenderWithSetupState(component: Record<string, unknown>, debugLabel?: string): void {
  if (component.__renderPatched) {
    return
  }
  const originalRender = component.render
  if (typeof originalRender !== 'function') {
    return
  }

  component.render = function renderWithSetupState(...args: unknown[]) {
    const instance = this as unknown as ComponentPublicInstance & {
      $?: { setupState?: Record<string, unknown> }
    }
    const setupState = instance?.$?.setupState
    const ctx = args[0]
    const ctxObject =
      ctx && typeof ctx === 'object'
        ? (ctx as Record<string, unknown>)
        : instance && typeof instance === 'object'
          ? (instance as unknown as Record<string, unknown>)
          : null

    if (setupState && ctxObject && Object.keys(setupState).length > 0) {
      const shouldMerge = Object.keys(setupState).some((key) => !(key in ctxObject))
      if (shouldMerge) {
        if (isDev) {
          devLog('[WidgetRegistry] render ctx missing setupState, patching', {
            widgetId: debugLabel,
            missing: Object.keys(setupState).filter((key) => !(key in ctxObject))
          })
        }
        const merged = new Proxy(ctxObject, {
          get(target, key, receiver) {
            if (key in setupState) {
              return Reflect.get(setupState, key, receiver)
            }
            return Reflect.get(target, key, receiver)
          },
          has(target, key) {
            return key in setupState || key in target
          }
        })
        return originalRender.call(instance, merged, ...args.slice(1))
      }
    }

    return originalRender.apply(instance, args as unknown[])
  }

  component.__renderPatched = true
}

function attachPluginInfoToComponent(
  component: Component,
  pluginInfo: Record<string, unknown>
): Component {
  const candidate = component as WidgetComponent | WidgetFunctionalComponent

  if (candidate && typeof candidate === 'object') {
    if (candidate.__pluginInjected) {
      return component
    }

    const originalSetup = candidate.setup
    const originalBeforeCreate = candidate.beforeCreate
    const canMutate = Object.isExtensible(candidate)

    const wrapSetup = (props: Record<string, unknown>, ctx: SetupContext) => {
      const instance = Vue.getCurrentInstance()
      const proxy = instance?.proxy as PluginInjectedInstance | null
      if (proxy) {
        proxy.$plugin = pluginInfo
      }
      const result = originalSetup ? originalSetup(props, ctx) : undefined
      if (isDev && result && typeof result === 'object') {
        const keys = Object.keys(result as Record<string, unknown>)
        devLog('[WidgetRegistry] setup result', {
          keys,
          hasHistory: 'history' in (result as Record<string, unknown>)
        })
      }
      return result
    }

    const wrapBeforeCreate = function (this: PluginInjectedInstance) {
      this.$plugin = pluginInfo
      if (typeof originalBeforeCreate === 'function') {
        originalBeforeCreate.call(this)
      }
    }

    if (canMutate) {
      candidate.setup = wrapSetup
      candidate.beforeCreate = wrapBeforeCreate
      candidate.__pluginInjected = true
      wrapRenderWithSetupState(candidate, pluginInfo?.name as string | undefined)
      if (isDev) {
        devLog('[WidgetRegistry] component patched', describeExportShape(candidate))
      }
      return candidate as Component
    }

    const wrapped: WidgetComponent = {
      ...candidate,
      setup: wrapSetup,
      beforeCreate: wrapBeforeCreate,
      __pluginInjected: true
    }
    wrapRenderWithSetupState(wrapped, pluginInfo?.name as string | undefined)
    if (isDev) {
      devLog('[WidgetRegistry] component wrapped', describeExportShape(wrapped))
    }
    return wrapped as Component
  }

  if (typeof candidate === 'function') {
    const wrapped = Vue.defineComponent({
      name: 'WidgetPluginWrapper',
      setup(props: Record<string, unknown>, ctx: SetupContext) {
        const instance = Vue.getCurrentInstance()
        const proxy = instance?.proxy as PluginInjectedInstance | null
        if (proxy) {
          proxy.$plugin = pluginInfo
        }
        return () => Vue.h(candidate as Component, props, ctx.slots)
      }
    }) as Component & { __pluginInjected?: boolean }

    wrapped.__pluginInjected = true
    return wrapped
  }

  return component
}

/**
 * Create a sandboxed require function for widgets
 * 为 widget 创建沙箱化的 require 函数
 * @param allowedDependencies - List of allowed module names
 * @returns Safe require function
 * @throws Error if any declared dependency is not available
 */
function createSandboxRequire(allowedDependencies: string[]): (id: string) => unknown {
  // Validate that all declared dependencies are available before creating the sandbox
  const unavailableDeps = allowedDependencies.filter((dep) => {
    if (!ALLOWED_PACKAGES.includes(dep)) {
      return true // Not in allowed list
    }
    if (!(dep in preloadedModuleCache)) {
      return true // Failed to preload
    }
    return false
  })

  if (unavailableDeps.length > 0) {
    throw new Error(
      `[WidgetSandbox] Cannot create sandbox: dependencies not available: ${unavailableDeps.join(', ')}. ` +
        `Allowed packages: ${ALLOWED_PACKAGES.join(', ')}`
    )
  }

  return function sandboxRequire(id: string) {
    if (!allowedDependencies.includes(id)) {
      throw new Error(
        `[WidgetSandbox] Module "${id}" is not allowed. Available modules: ${allowedDependencies.join(', ')}`
      )
    }

    // At this point, we've validated the module exists in preloadedModuleCache
    return preloadedModuleCache[id]
  }
}

/**
 * Evaluate widget component code in a sandboxed environment
 * 在沙箱环境中执行 widget 组件代码
 * @param code - Compiled widget code
 * @param dependencies - Allowed dependencies
 * @returns Vue component
 */
function evaluateWidgetComponent(
  code: string,
  dependencies: string[] = [],
  debugLabel?: string,
  sandbox?: WidgetSandboxContext
): Component {
  if (!sandbox) {
    throw new Error('[WidgetRegistry] Widget sandbox is required to evaluate component')
  }
  const module: { exports: unknown } = { exports: {} }
  const customRequire = createSandboxRequire(dependencies)
  const sandboxWindow = sandbox.window
  const sandboxGlobal = sandbox.globalThis
  const sandboxLocalStorage = sandbox.localStorage
  const sandboxSessionStorage = sandbox.sessionStorage
  const sandboxDocument = sandbox.document
  const sandboxIndexedDB = sandbox.indexedDB
  const sandboxBroadcastChannel = sandbox.BroadcastChannel
  const sandboxCaches = sandbox.caches
  const sandboxSelf = sandbox.self

  try {
    cacheWidgetRuntimeSource(debugLabel, code)
    const executor = new Function(
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
      'self',
      code
    )
    executor(
      customRequire,
      module,
      module.exports,
      sandboxWindow,
      sandboxGlobal,
      sandboxLocalStorage,
      sandboxSessionStorage,
      sandboxDocument,
      sandboxIndexedDB,
      sandboxBroadcastChannel,
      sandboxCaches,
      sandboxSelf
    )
  } catch (error) {
    console.error('[WidgetRegistry] Widget execution failed:', error)
    throw error
  }

  const moduleExports = module.exports
  const defaultExport =
    isObjectLike(moduleExports) && 'default' in moduleExports
      ? (moduleExports as { default?: unknown }).default
      : undefined
  const renderExport =
    isObjectLike(moduleExports) && 'render' in moduleExports
      ? (moduleExports as { render?: unknown }).render
      : undefined

  const hasSetup = (value: unknown): boolean =>
    Boolean(value && (typeof value === 'object' || typeof value === 'function') && 'setup' in value)
  const hasRender = (value: unknown): boolean =>
    Boolean(
      value && (typeof value === 'object' || typeof value === 'function') && 'render' in value
    )

  let exported =
    (hasSetup(defaultExport) ? defaultExport : undefined) ??
    (hasSetup(moduleExports) ? moduleExports : undefined) ??
    (hasRender(defaultExport) ? defaultExport : undefined) ??
    (hasRender(moduleExports) ? moduleExports : undefined) ??
    defaultExport ??
    moduleExports

  exported = normalizeWidgetExport(exported, renderExport)
  if (renderExport && exported && typeof exported === 'object' && !hasRender(exported)) {
    const target = exported as { render?: unknown }
    target.render = renderExport
  }

  if (isDev) {
    devLog('[WidgetRegistry] export resolution', {
      widgetId: debugLabel,
      module: describeExportShape(moduleExports),
      defaultExport: describeExportShape(defaultExport),
      renderType: typeof renderExport,
      resolved: describeExportShape(exported)
    })
  }

  if (!exported) {
    throw new Error('Widget component did not export a value')
  }

  return exported as Component
}

function injectStyles(widgetId: string, styles: string): void {
  if (!styles) return

  const existing = injectedStyles.get(widgetId)
  if (existing) {
    existing.textContent = styles
    return
  }

  const style = document.createElement('style')
  style.dataset.widgetId = widgetId
  style.textContent = styles
  document.head.appendChild(style)
  injectedStyles.set(widgetId, style)
}

async function handleWidgetRegister(payload: WidgetRegistrationPayload): Promise<void> {
  try {
    if (isDev) {
      devLog(
        `[WidgetRegistry] register widget ${payload.widgetId} (${payload.pluginName}:${payload.featureId})`
      )
      const deps = payload.dependencies?.length ? payload.dependencies.join(', ') : '-'
      const sourceType = resolveWidgetSourceType(payload.filePath)
      devLog(
        `[WidgetRegistry] payload stats: code=${payload.code.length} styles=${payload.styles.length} deps=${deps}`
      )
      devLog(`[WidgetRegistry] source type=${sourceType} file=${payload.filePath || '-'}`)
      if (!payload.styles) {
        console.warn(`[WidgetRegistry] widget ${payload.widgetId} has empty styles`)
      }
    }
    const sandbox = await createWidgetSandbox(payload.pluginName, payload.widgetId)
    const component = attachPluginInfoToComponent(
      evaluateWidgetComponent(payload.code, payload.dependencies || [], payload.widgetId, sandbox),
      { name: payload.pluginName, featureId: payload.featureId }
    )
    registerCustomRenderer(payload.widgetId, component)
    injectStyles(payload.widgetId, payload.styles)
    if (isDev) {
      const componentName =
        (component as { name?: string; __name?: string })?.name ||
        (component as { __name?: string })?.__name ||
        'anonymous'
      devLog(`[WidgetRegistry] registered widget ${payload.widgetId} (${componentName})`)
    }
  } catch (error) {
    console.error('[WidgetRegistry] Widget registration failed', error)
    throw error
  }
}

async function handleWidgetUpdate(payload: WidgetRegistrationPayload): Promise<void> {
  try {
    if (isDev) {
      devLog(
        `[WidgetRegistry] update widget ${payload.widgetId} (${payload.pluginName}:${payload.featureId})`
      )
      const deps = payload.dependencies?.length ? payload.dependencies.join(', ') : '-'
      const sourceType = resolveWidgetSourceType(payload.filePath)
      devLog(
        `[WidgetRegistry] payload stats: code=${payload.code.length} styles=${payload.styles.length} deps=${deps}`
      )
      devLog(`[WidgetRegistry] source type=${sourceType} file=${payload.filePath || '-'}`)
      if (!payload.styles) {
        console.warn(`[WidgetRegistry] widget ${payload.widgetId} has empty styles`)
      }
    }
    const sandbox = await createWidgetSandbox(payload.pluginName, payload.widgetId)
    const component = attachPluginInfoToComponent(
      evaluateWidgetComponent(payload.code, payload.dependencies || [], payload.widgetId, sandbox),
      { name: payload.pluginName, featureId: payload.featureId }
    )
    registerCustomRenderer(payload.widgetId, component)
    injectStyles(payload.widgetId, payload.styles)
    if (isDev) {
      const componentName =
        (component as { name?: string; __name?: string })?.name ||
        (component as { __name?: string })?.__name ||
        'anonymous'
      devLog(`[WidgetRegistry] updated widget ${payload.widgetId} (${componentName})`)
    }
  } catch (error) {
    console.error('[WidgetRegistry] Widget update failed', error)
    throw error
  }
}

function handleWidgetUnregister({ widgetId }: { widgetId: string }): void {
  try {
    if (isDev) {
      devLog(`[WidgetRegistry] unregister widget ${widgetId}`)
    }
    clearWidgetRuntimeSource(widgetId)
    unregisterCustomRenderer(widgetId)
    const style = injectedStyles.get(widgetId)
    if (style) {
      style.remove()
      injectedStyles.delete(widgetId)
    }
  } catch (error) {
    console.error('[WidgetRegistry] Widget unregister failed', error)
    throw error
  }
}

function bindTransportHandlers(): void {
  if (transportBindingsReady) return
  transportBindingsReady = true
  transport.on(widgetRegisterEvent, handleWidgetRegister)
  transport.on(widgetUpdateEvent, handleWidgetUpdate)
  transport.on(widgetUnregisterEvent, handleWidgetUnregister)
}

function ensureTransportHandlersReady(): void {
  if (transportBindingsReady) return

  if (tryUseChannel()) {
    bindTransportHandlers()
    return
  }

  if (transportBindingTaskId) return
  const taskId = `widget-registry.channel-check.${Date.now()}`
  transportBindingTaskId = taskId

  pollingService.register(
    taskId,
    () => {
      if (transportBindingsReady) {
        pollingService.unregister(taskId)
        if (transportBindingTaskId === taskId) {
          transportBindingTaskId = null
        }
        return
      }

      if (tryUseChannel()) {
        bindTransportHandlers()
        pollingService.unregister(taskId)
        if (transportBindingTaskId === taskId) {
          transportBindingTaskId = null
        }
      }
    },
    { interval: 100, unit: 'milliseconds' }
  )
  pollingService.start()

  setTimeout(() => {
    if (transportBindingTaskId === taskId) {
      pollingService.unregister(taskId)
      transportBindingTaskId = null
    }
  }, 5000)
}

ensureTransportHandlersReady()
