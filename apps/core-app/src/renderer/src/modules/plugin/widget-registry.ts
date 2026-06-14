import type {
  WidgetFailurePayload,
  WidgetRegistrationPayload,
  WidgetRuntime,
  WidgetSandboxEvidence
} from '@talex-touch/utils/plugin/widget'
import type { Component, ComponentPublicInstance, SetupContext } from 'vue'
import { WIDGET_ALLOWED_PACKAGES, WIDGET_RUNTIMES } from '@talex-touch/utils/plugin/widget'
import * as ArrowCore from '@arrow-js/core'
import * as TalexUtils from '@talex-touch/utils'
import * as TalexUtilsCommon from '@talex-touch/utils/common'
import * as TalexUtilsCoreBox from '@talex-touch/utils/core-box'
import * as TalexUtilsPlugin from '@talex-touch/utils/plugin'
import * as TalexUtilsPluginSdk from '@talex-touch/utils/plugin/sdk'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import * as TalexUtilsTransport from '@talex-touch/utils/transport'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents, PluginEvents } from '@talex-touch/utils/transport/events'
import * as TalexUtilsTypes from '@talex-touch/utils/types'
import * as Vue from 'vue'
import {
  getCustomRenderer,
  registerCustomRenderer,
  unregisterCustomRenderer
} from '../box/custom-render'
import { devLog } from '../../utils/dev-log'
import { createRendererLogger } from '../../utils/renderer-log'
import {
  cacheWidgetRuntimeSource,
  clearWidgetSandboxEvidence,
  clearWidgetFailure,
  clearWidgetRuntimeSource,
  recordWidgetFailure,
  recordWidgetSandboxEvidence
} from './widget-diagnostics'

export {
  getWidgetFailure,
  getWidgetRuntimeSnippet,
  getWidgetSandboxEvidence
} from './widget-diagnostics'

const widgetRegistryLog = createRendererLogger('WidgetRegistry')
const injectedStyles = new Map<string, HTMLStyleElement>()
const widgetSetupStatePatchLogCache = new Set<string>()
const transport = useTuffTransport()
const widgetRegisterEvent = PluginEvents.widget.register
const widgetUpdateEvent = PluginEvents.widget.update
const widgetUnregisterEvent = PluginEvents.widget.unregister
const widgetFailedEvent = PluginEvents.widget.failed
const isDev = import.meta.env?.DEV ?? false
const pollingService = PollingService.getInstance()
const registeredWidgetHashes = new Map<string, string>()
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
const WIDGET_SANDBOX_INJECTED_GLOBALS = [
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
] as const

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
        widgetRegistryLog.warn('Failed to load widget storage', error)
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
        widgetRegistryLog.warn('Storage entry too large, ignoring setItem')
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
          widgetRegistryLog.warn('Storage quota exceeded, ignoring setItem')
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
            widgetRegistryLog.warn('Cookie entry too large, ignoring set')
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
            widgetRegistryLog.warn('Storage quota exceeded, ignoring cookie set')
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
const ALLOWED_PACKAGES: readonly string[] = WIDGET_ALLOWED_PACKAGES

// Pre-loaded module cache using ES imports
const preloadedModuleCache: Record<string, unknown> = {
  '@arrow-js/core': ArrowCore,
  vue: Vue,
  '@talex-touch/utils': TalexUtils,
  '@talex-touch/utils/plugin': TalexUtilsPlugin,
  '@talex-touch/utils/plugin/sdk': TalexUtilsPluginSdk,
  '@talex-touch/utils/core-box': TalexUtilsCoreBox,
  '@talex-touch/utils/transport': TalexUtilsTransport,
  '@talex-touch/utils/common': TalexUtilsCommon,
  '@talex-touch/utils/types': TalexUtilsTypes
}

function normalizeWidgetDependencies(dependencies?: string[]): string[] {
  return Array.from(
    new Set(
      (dependencies ?? [])
        .map((dependency) => dependency.trim())
        .filter((dependency) => dependency.length > 0)
    )
  )
}

function isWidgetDependencyAvailable(dependency: string): boolean {
  return ALLOWED_PACKAGES.includes(dependency) && dependency in preloadedModuleCache
}

function addUniqueDependency(target: string[], dependency: string): void {
  if (!target.includes(dependency)) {
    target.push(dependency)
  }
}

export function buildWidgetSandboxEvidence(
  payload: WidgetRegistrationPayload
): WidgetSandboxEvidence {
  const declaredDependencies = normalizeWidgetDependencies(payload.dependencies)
  const allowedDependencies = declaredDependencies.filter(isWidgetDependencyAvailable)
  const blockedDependencies = declaredDependencies.filter(
    (dependency) => !isWidgetDependencyAvailable(dependency)
  )

  return {
    widgetId: payload.widgetId,
    pluginName: payload.pluginName,
    featureId: payload.featureId,
    filePath: payload.filePath,
    runtime: payload.runtime,
    runtimeStage: payload.runtimeStage,
    sourceType: resolveWidgetSourceType(payload.filePath),
    hash: payload.hash,
    declaredDependencies,
    allowedDependencies,
    blockedDependencies,
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
      mode: 'new-function',
      injectedGlobals: [...WIDGET_SANDBOX_INJECTED_GLOBALS]
    }
  }
}

type PluginInjectedInstance = ComponentPublicInstance & { $plugin?: Record<string, unknown> }

type WidgetSetup = (props: Record<string, unknown>, ctx: SetupContext) => unknown

type WidgetComponent = {
  setup?: WidgetSetup
  beforeCreate?: (this: PluginInjectedInstance) => void
  __pluginInjected?: boolean
} & Record<string, unknown>

type WidgetFunctionalComponent = (props: Record<string, unknown>, ctx: SetupContext) => unknown
type WidgetHostProps = {
  item?: unknown
  payload?: unknown
  preview?: boolean
  widgetId?: string
  hostKeyEvent?: unknown
}
type ArrowHostState = WidgetHostProps & {
  mounted: boolean
}
type ArrowPrimitiveRenderable = string | number | boolean | null | undefined
type ArrowTemplateLike = ((parent?: Node | DocumentFragment) => unknown) & { isT?: boolean }
type ArrowComponentCallLike = {
  h: (...args: unknown[]) => unknown
  p?: unknown
  e?: unknown
  k?: unknown
}
type CustomElementDefinitionExport = {
  tagName?: string
  define?: () => void
  element?: typeof HTMLElement
}

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

function resolveComponentExport(moduleExports: unknown): {
  defaultExport: unknown
  renderExport: unknown
  exported: unknown
} {
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

  return { defaultExport, renderExport, exported }
}

function copyEnumerableRenderContext(
  target: Record<PropertyKey, unknown>,
  source: Record<PropertyKey, unknown>
): void {
  for (const key of Reflect.ownKeys(source)) {
    if (!Object.prototype.propertyIsEnumerable.call(source, key)) {
      continue
    }

    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: Reflect.get(source, key, source)
    })
  }
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
    const instance = this as unknown as ComponentPublicInstance
    const internalInstance = Vue.getCurrentInstance() as
      | ({ setupState?: Record<string, unknown> } & object)
      | null
    const setupState = internalInstance?.setupState
    const ctx = args[0]
    const ctxObject = ctx && typeof ctx === 'object' ? (ctx as Record<string, unknown>) : null

    if (setupState && Object.keys(setupState).length > 0) {
      const shouldMerge = !ctxObject || Object.keys(setupState).some((key) => !(key in ctxObject))
      if (shouldMerge) {
        if (isDev) {
          const missingKeys = Object.keys(setupState).filter(
            (key) => !ctxObject || !(key in ctxObject)
          )
          const logKey = `${debugLabel || 'unknown'}:${missingKeys.join(',')}`
          if (!widgetSetupStatePatchLogCache.has(logKey)) {
            widgetSetupStatePatchLogCache.add(logKey)
            devLog('[WidgetRegistry] render ctx missing setupState, patching', {
              widgetId: debugLabel,
              missing: missingKeys
            })
          }
        }
        const merged = Object.create(
          instance && typeof instance === 'object' ? (instance as unknown as object) : null
        ) as Record<PropertyKey, unknown>

        if (ctxObject) {
          copyEnumerableRenderContext(merged, ctxObject)
        }

        for (const key of Object.keys(setupState)) {
          if (key in merged) {
            continue
          }

          Object.defineProperty(merged, key, {
            configurable: true,
            enumerable: true,
            get() {
              return setupState[key]
            }
          })
        }

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

function syncHostElementProps(element: HTMLElement, props: WidgetHostProps): void {
  Object.assign(element, {
    item: props.item,
    payload: props.payload,
    preview: props.preview,
    widgetId: props.widgetId,
    hostKeyEvent: props.hostKeyEvent
  })
}

function isHTMLElementConstructor(value: unknown): value is typeof HTMLElement {
  return (
    typeof value === 'function' &&
    typeof HTMLElement !== 'undefined' &&
    (value === HTMLElement || value.prototype instanceof HTMLElement)
  )
}

function makeWebComponentTagName(name: string): string {
  const normalized = name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `tuff-widget-${normalized || 'element'}`
}

function resolveWebComponentDefinition(exported: unknown): {
  tagName: string
  define?: () => void
} {
  if (typeof exported === 'string' && exported.includes('-')) {
    return { tagName: exported }
  }

  if (isHTMLElementConstructor(exported)) {
    const tagName = makeWebComponentTagName(exported.name)
    return {
      tagName,
      define: () => {
        if (!customElements.get(tagName)) {
          customElements.define(tagName, exported)
        }
      }
    }
  }

  if (isObjectLike(exported)) {
    const definition = exported as CustomElementDefinitionExport
    if (typeof definition.tagName === 'string' && definition.tagName.includes('-')) {
      return {
        tagName: definition.tagName,
        define: definition.define
      }
    }
    if (typeof definition.define === 'function') {
      throw new Error('[WidgetRegistry] WebComponent widget define() requires a tagName')
    }
    if (isHTMLElementConstructor(definition.element)) {
      const tagName = makeWebComponentTagName(definition.element.name)
      return {
        tagName,
        define: () => {
          if (!customElements.get(tagName)) {
            customElements.define(tagName, definition.element!)
          }
        }
      }
    }
  }

  throw new Error(
    '[WidgetRegistry] WebComponent widget must export a tag name, HTMLElement class, or { tagName, define }'
  )
}

function createWebComponentHost(exported: unknown): Component {
  const definition = resolveWebComponentDefinition(exported)
  if (!customElements.get(definition.tagName) && !definition.define) {
    throw new Error(
      `[WidgetRegistry] WebComponent widget tag "${definition.tagName}" is not defined`
    )
  }
  if (!customElements.get(definition.tagName)) {
    definition.define?.()
  }
  if (!customElements.get(definition.tagName)) {
    throw new Error(`[WidgetRegistry] WebComponent widget failed to define "${definition.tagName}"`)
  }

  return Vue.defineComponent({
    name: 'TouchWidgetWebComponentHost',
    props: ['item', 'payload', 'preview', 'widgetId', 'hostKeyEvent'],
    setup(props) {
      const host = Vue.ref<HTMLElement | null>(null)
      let element: HTMLElement | null = null

      const sync = () => {
        if (!element) return
        syncHostElementProps(element, props as WidgetHostProps)
      }

      Vue.onMounted(() => {
        if (!host.value) return
        element = document.createElement(definition.tagName)
        element.dataset.widgetRuntime = WIDGET_RUNTIMES.WEBCOMPONENT
        sync()
        host.value.replaceChildren(element)
      })

      Vue.watch(
        () => [props.item, props.payload, props.preview, props.widgetId, props.hostKeyEvent],
        sync,
        { deep: true }
      )

      Vue.onBeforeUnmount(() => {
        element?.remove()
        element = null
      })

      return () => Vue.h('div', { ref: host, class: 'TouchWidgetWebComponentHost' })
    }
  })
}

function isArrowTemplate(value: unknown): value is ArrowTemplateLike {
  return typeof value === 'function' && (value as ArrowTemplateLike).isT === true
}

function isArrowComponentCall(value: unknown): value is ArrowComponentCallLike {
  return Boolean(value && typeof value === 'object' && 'h' in value)
}

function isArrowPrimitiveRenderable(value: unknown): value is ArrowPrimitiveRenderable {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

function isArrowRenderable(value: unknown): boolean {
  if (isArrowPrimitiveRenderable(value) || isArrowTemplate(value) || isArrowComponentCall(value)) {
    return true
  }
  return Array.isArray(value) && value.every(isArrowRenderable)
}

function resolveArrowRenderable(exported: unknown, props: ArrowHostState): unknown {
  if (isArrowTemplate(exported) || isArrowComponentCall(exported)) {
    return exported
  }
  return (exported as (props: WidgetHostProps) => unknown)(props)
}

function createArrowHost(exported: unknown): Component {
  if (
    typeof exported !== 'function' &&
    !isArrowTemplate(exported) &&
    !isArrowComponentCall(exported)
  ) {
    throw new Error(
      '[WidgetRegistry] Arrow widget must export an Arrow component or template factory'
    )
  }

  return Vue.defineComponent({
    name: 'TouchWidgetArrowHost',
    props: ['item', 'payload', 'preview', 'widgetId', 'hostKeyEvent'],
    setup(props) {
      const host = Vue.ref<HTMLElement | null>(null)
      let state: ArrowHostState | null = null

      const syncState = () => {
        if (!state) return
        state.item = props.item
        state.payload = props.payload
        state.preview = props.preview
        state.widgetId = props.widgetId
        state.hostKeyEvent = props.hostKeyEvent
      }

      const mountArrow = () => {
        if (!host.value) return
        state = ArrowCore.reactive({
          mounted: true,
          item: props.item,
          payload: props.payload,
          preview: props.preview,
          widgetId: props.widgetId,
          hostKeyEvent: props.hostKeyEvent
        }) as ArrowHostState

        const root = ArrowCore.html`${() => {
          if (!state?.mounted) {
            return ''
          }
          const renderable = resolveArrowRenderable(exported, state)
          if (isArrowRenderable(renderable)) {
            return renderable
          }
          throw new Error(
            '[WidgetRegistry] Arrow widget render did not return an Arrow template or component'
          )
        }}`

        host.value.replaceChildren()
        root(host.value)
      }

      const unmountArrow = () => {
        const target = host.value
        if (!state) {
          target?.replaceChildren()
          return
        }
        state.mounted = false
        state = null
        void ArrowCore.nextTick(() => {
          target?.replaceChildren()
        })
      }

      Vue.onMounted(mountArrow)
      Vue.watch(
        () => [props.item, props.payload, props.preview, props.widgetId, props.hostKeyEvent],
        syncState,
        { deep: true }
      )
      Vue.onBeforeUnmount(unmountArrow)

      return () => Vue.h('div', { ref: host, class: 'TouchWidgetArrowHost' })
    }
  })
}

function resolveWidgetComponent(exported: unknown, runtime?: WidgetRuntime): Component {
  if (runtime === WIDGET_RUNTIMES.WEBCOMPONENT) {
    return createWebComponentHost(exported)
  }
  if (runtime === WIDGET_RUNTIMES.ARROW) {
    return createArrowHost(exported)
  }
  return exported as Component
}

/**
 * Create a sandboxed require function for widgets
 * 为 widget 创建沙箱化的 require 函数
 * @param evidence - Runtime evidence updated when widget code reaches require()
 * @returns Safe require function
 * @throws Error if any declared dependency is not available
 */
function createSandboxRequire(evidence: WidgetSandboxEvidence): (id: string) => unknown {
  if (evidence.blockedDependencies.length > 0) {
    throw new Error(
      `[WidgetSandbox] Cannot create sandbox: dependencies not available: ${evidence.blockedDependencies.join(', ')}. ` +
        `Allowed packages: ${ALLOWED_PACKAGES.join(', ')}`
    )
  }

  return function sandboxRequire(id: string) {
    const moduleName = String(id).trim()
    if (!evidence.declaredDependencies.includes(moduleName)) {
      addUniqueDependency(evidence.undeclaredDependencies, moduleName)
      throw new Error(
        `[WidgetSandbox] Module "${moduleName}" is not allowed. Available modules: ${evidence.declaredDependencies.join(', ')}`
      )
    }

    return preloadedModuleCache[moduleName]
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
  evidence: WidgetSandboxEvidence,
  debugLabel?: string,
  sandbox?: WidgetSandboxContext
): unknown {
  if (!sandbox) {
    throw new Error('[WidgetRegistry] Widget sandbox is required to evaluate component')
  }
  const module: { exports: unknown } = { exports: {} }
  const customRequire = createSandboxRequire(evidence)
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
    const executor = new Function(...WIDGET_SANDBOX_INJECTED_GLOBALS, code)
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
    widgetRegistryLog.error('Widget execution failed:', error)
    throw error
  }

  const moduleExports = module.exports
  const { defaultExport, renderExport, exported } = resolveComponentExport(moduleExports)

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

  return exported
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

function removeInjectedStyles(widgetId: string): void {
  const style = injectedStyles.get(widgetId)
  if (!style) return
  style.remove()
  injectedStyles.delete(widgetId)
}

function clearRegisteredWidgetRuntime(widgetId: string): void {
  registeredWidgetHashes.delete(widgetId)
  unregisterCustomRenderer(widgetId)
  removeInjectedStyles(widgetId)
}

function resolveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function resolveErrorCause(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}

function recordWidgetRuntimeFailure(
  payload: WidgetRegistrationPayload,
  error: unknown,
  sandboxEvidence?: WidgetSandboxEvidence
): void {
  const failure: WidgetFailurePayload = {
    widgetId: payload.widgetId,
    pluginName: payload.pluginName,
    featureId: payload.featureId,
    runtime: payload.runtime,
    runtimeStage: payload.runtimeStage,
    code: 'WIDGET_RUNTIME_REGISTER_FAILED',
    message: resolveErrorMessage(error),
    filePath: payload.filePath,
    hash: payload.hash
  }
  const cause = resolveErrorCause(error)
  if (cause) {
    failure.cause = cause
  }
  if (sandboxEvidence) {
    failure.sandboxEvidence = sandboxEvidence
  }
  recordWidgetFailure(failure)
}

export async function handleWidgetRegister(payload: WidgetRegistrationPayload): Promise<void> {
  if (
    registeredWidgetHashes.get(payload.widgetId) === payload.hash &&
    getCustomRenderer(payload.widgetId)
  ) {
    if (isDev) {
      devLog(`[WidgetRegistry] skip duplicate widget register ${payload.widgetId}`)
    }
    return
  }

  let sandboxEvidence: WidgetSandboxEvidence | undefined
  try {
    clearWidgetFailure(payload.widgetId)
    clearWidgetSandboxEvidence(payload.widgetId)
    sandboxEvidence = buildWidgetSandboxEvidence(payload)
    recordWidgetSandboxEvidence(sandboxEvidence)
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
        widgetRegistryLog.warn(`widget ${payload.widgetId} has empty styles`)
      }
    }
    const sandbox = await createWidgetSandbox(payload.pluginName, payload.widgetId)
    const exported = evaluateWidgetComponent(
      payload.code,
      sandboxEvidence,
      payload.widgetId,
      sandbox
    )
    const runtimeComponent = resolveWidgetComponent(exported, payload.runtime)
    const component =
      payload.runtime === WIDGET_RUNTIMES.VUE || !payload.runtime
        ? attachPluginInfoToComponent(runtimeComponent, {
            name: payload.pluginName,
            featureId: payload.featureId
          })
        : runtimeComponent
    registerCustomRenderer(payload.widgetId, component)
    registeredWidgetHashes.set(payload.widgetId, payload.hash)
    injectStyles(payload.widgetId, payload.styles)
    if (isDev) {
      const componentName =
        (component as { name?: string; __name?: string })?.name ||
        (component as { __name?: string })?.__name ||
        'anonymous'
      devLog(`[WidgetRegistry] registered widget ${payload.widgetId} (${componentName})`)
    }
  } catch (error) {
    if (sandboxEvidence) {
      recordWidgetSandboxEvidence(sandboxEvidence)
    }
    clearRegisteredWidgetRuntime(payload.widgetId)
    recordWidgetRuntimeFailure(payload, error, sandboxEvidence)
    widgetRegistryLog.error('Widget registration failed', error)
    throw error
  }
}

export async function handleWidgetUpdate(payload: WidgetRegistrationPayload): Promise<void> {
  let sandboxEvidence: WidgetSandboxEvidence | undefined
  try {
    clearWidgetFailure(payload.widgetId)
    clearWidgetSandboxEvidence(payload.widgetId)
    sandboxEvidence = buildWidgetSandboxEvidence(payload)
    recordWidgetSandboxEvidence(sandboxEvidence)
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
        widgetRegistryLog.warn(`widget ${payload.widgetId} has empty styles`)
      }
    }
    const sandbox = await createWidgetSandbox(payload.pluginName, payload.widgetId)
    const exported = evaluateWidgetComponent(
      payload.code,
      sandboxEvidence,
      payload.widgetId,
      sandbox
    )
    const runtimeComponent = resolveWidgetComponent(exported, payload.runtime)
    const component =
      payload.runtime === WIDGET_RUNTIMES.VUE || !payload.runtime
        ? attachPluginInfoToComponent(runtimeComponent, {
            name: payload.pluginName,
            featureId: payload.featureId
          })
        : runtimeComponent
    registerCustomRenderer(payload.widgetId, component)
    registeredWidgetHashes.set(payload.widgetId, payload.hash)
    injectStyles(payload.widgetId, payload.styles)
    if (isDev) {
      const componentName =
        (component as { name?: string; __name?: string })?.name ||
        (component as { __name?: string })?.__name ||
        'anonymous'
      devLog(`[WidgetRegistry] updated widget ${payload.widgetId} (${componentName})`)
    }
  } catch (error) {
    if (sandboxEvidence) {
      recordWidgetSandboxEvidence(sandboxEvidence)
    }
    clearRegisteredWidgetRuntime(payload.widgetId)
    recordWidgetRuntimeFailure(payload, error, sandboxEvidence)
    widgetRegistryLog.error('Widget update failed', error)
    throw error
  }
}

export function handleWidgetUnregister({ widgetId }: { widgetId: string }): void {
  try {
    if (isDev) {
      devLog(`[WidgetRegistry] unregister widget ${widgetId}`)
    }
    clearWidgetRuntimeSource(widgetId)
    clearWidgetFailure(widgetId)
    clearWidgetSandboxEvidence(widgetId)
    clearRegisteredWidgetRuntime(widgetId)
  } catch (error) {
    widgetRegistryLog.error('Widget unregister failed', error)
    throw error
  }
}

export function handleWidgetFailed(payload: WidgetFailurePayload): void {
  recordWidgetFailure(payload)
  clearWidgetSandboxEvidence(payload.widgetId)
  if (payload.sandboxEvidence) {
    recordWidgetSandboxEvidence(payload.sandboxEvidence)
  }
  clearWidgetRuntimeSource(payload.widgetId)
  clearRegisteredWidgetRuntime(payload.widgetId)
  if (isDev) {
    devLog(`[WidgetRegistry] widget failed ${payload.widgetId} (${payload.code})`, payload)
  }
}

function bindTransportHandlers(): boolean {
  if (transportBindingsReady) return true
  const disposers: Array<() => void> = []
  try {
    disposers.push(transport.on(widgetRegisterEvent, handleWidgetRegister))
    disposers.push(transport.on(widgetUpdateEvent, handleWidgetUpdate))
    disposers.push(transport.on(widgetFailedEvent, handleWidgetFailed))
    disposers.push(transport.on(widgetUnregisterEvent, handleWidgetUnregister))
    transportBindingsReady = true
    return true
  } catch (error) {
    disposers.forEach((dispose) => {
      try {
        dispose()
      } catch {
        // ignore cleanup errors during transport binding retry
      }
    })
    widgetRegistryLog.warn('Transport not ready, will retry binding handlers', error)
    return false
  }
}

function ensureTransportHandlersReady(): void {
  if (transportBindingsReady) return

  if (bindTransportHandlers()) {
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

      if (bindTransportHandlers()) {
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
