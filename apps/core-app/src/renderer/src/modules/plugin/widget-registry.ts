import type { WidgetRegistrationPayload } from '@talex-touch/utils/plugin/widget'
import type { Component, ComponentPublicInstance, SetupContext } from 'vue'
import * as TalexUtils from '@talex-touch/utils'
import * as TalexUtilsChannel from '@talex-touch/utils/channel'
import * as TalexUtilsCommon from '@talex-touch/utils/common'
import * as TalexUtilsCoreBox from '@talex-touch/utils/core-box'
import * as TalexUtilsPlugin from '@talex-touch/utils/plugin'
import * as TalexUtilsPluginSdk from '@talex-touch/utils/plugin/sdk'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import * as TalexUtilsTypes from '@talex-touch/utils/types'
import * as Vue from 'vue'
import { registerCustomRenderer, unregisterCustomRenderer } from '~/modules/box/custom-render'

const injectedStyles = new Map<string, HTMLStyleElement>()
const transport = useTuffTransport()
const widgetRegisterEvent = PluginEvents.widget.register
const widgetUpdateEvent = PluginEvents.widget.update
const widgetUnregisterEvent = PluginEvents.widget.unregister
const isDev = import.meta.env?.DEV ?? false

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
    console.debug(
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
          console.debug('[WidgetRegistry] render ctx missing setupState, patching', {
            widgetId: debugLabel,
            missing: Object.keys(setupState).filter((key) => !(key in ctxObject))
          })
        }
        const merged = new Proxy(ctxObject, {
          get(target, key) {
            if (key in setupState) {
              return setupState[key as keyof typeof setupState]
            }
            return target[key as keyof typeof target]
          }
        })
        return originalRender.call(instance, merged, ...args.slice(1))
      }
    }

    return originalRender.apply(instance, args as unknown as any[])
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
        console.debug('[WidgetRegistry] setup result', {
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
        console.debug('[WidgetRegistry] component patched', describeExportShape(candidate))
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
      console.debug('[WidgetRegistry] component wrapped', describeExportShape(wrapped))
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
  debugLabel?: string
): Component {
  const module: { exports: unknown } = { exports: {} }
  const customRequire = createSandboxRequire(dependencies)

  try {
    const executor = new Function('require', 'module', 'exports', code)
    executor(customRequire, module, module.exports)
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
    console.debug('[WidgetRegistry] export resolution', {
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

transport.on(widgetRegisterEvent, (payload: WidgetRegistrationPayload) => {
  try {
    if (isDev) {
      console.debug(
        `[WidgetRegistry] register widget ${payload.widgetId} (${payload.pluginName}:${payload.featureId})`
      )
      const deps = payload.dependencies?.length ? payload.dependencies.join(', ') : '-'
      const sourceType = resolveWidgetSourceType(payload.filePath)
      console.debug(
        `[WidgetRegistry] payload stats: code=${payload.code.length} styles=${payload.styles.length} deps=${deps}`
      )
      console.debug(`[WidgetRegistry] source type=${sourceType} file=${payload.filePath || '-'}`)
      if (!payload.styles) {
        console.warn(`[WidgetRegistry] widget ${payload.widgetId} has empty styles`)
      }
    }
    const component = attachPluginInfoToComponent(
      evaluateWidgetComponent(payload.code, payload.dependencies || [], payload.widgetId),
      { name: payload.pluginName, featureId: payload.featureId }
    )
    registerCustomRenderer(payload.widgetId, component)
    injectStyles(payload.widgetId, payload.styles)
    if (isDev) {
      const componentName =
        (component as { name?: string; __name?: string })?.name ||
        (component as { __name?: string })?.__name ||
        'anonymous'
      console.debug(`[WidgetRegistry] registered widget ${payload.widgetId} (${componentName})`)
    }
  } catch (error) {
    console.error('[WidgetRegistry] Widget registration failed', error)
    throw error
  }
})

transport.on(widgetUpdateEvent, (payload: WidgetRegistrationPayload) => {
  try {
    if (isDev) {
      console.debug(
        `[WidgetRegistry] update widget ${payload.widgetId} (${payload.pluginName}:${payload.featureId})`
      )
      const deps = payload.dependencies?.length ? payload.dependencies.join(', ') : '-'
      const sourceType = resolveWidgetSourceType(payload.filePath)
      console.debug(
        `[WidgetRegistry] payload stats: code=${payload.code.length} styles=${payload.styles.length} deps=${deps}`
      )
      console.debug(`[WidgetRegistry] source type=${sourceType} file=${payload.filePath || '-'}`)
      if (!payload.styles) {
        console.warn(`[WidgetRegistry] widget ${payload.widgetId} has empty styles`)
      }
    }
    const component = attachPluginInfoToComponent(
      evaluateWidgetComponent(payload.code, payload.dependencies || [], payload.widgetId),
      { name: payload.pluginName, featureId: payload.featureId }
    )
    registerCustomRenderer(payload.widgetId, component)
    injectStyles(payload.widgetId, payload.styles)
    if (isDev) {
      const componentName =
        (component as { name?: string; __name?: string })?.name ||
        (component as { __name?: string })?.__name ||
        'anonymous'
      console.debug(`[WidgetRegistry] updated widget ${payload.widgetId} (${componentName})`)
    }
  } catch (error) {
    console.error('[WidgetRegistry] Widget update failed', error)
    throw error
  }
})

transport.on(widgetUnregisterEvent, ({ widgetId }: { widgetId: string }) => {
  try {
    if (isDev) {
      console.debug(`[WidgetRegistry] unregister widget ${widgetId}`)
    }
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
})
