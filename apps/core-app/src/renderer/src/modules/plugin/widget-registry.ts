import type { WidgetRegistrationPayload } from '@talex-touch/utils/plugin/widget'
import type { Component } from 'vue'
import * as TalexUtils from '@talex-touch/utils'
import * as TalexUtilsChannel from '@talex-touch/utils/channel'
import * as TalexUtilsCommon from '@talex-touch/utils/common'
import * as TalexUtilsCoreBox from '@talex-touch/utils/core-box'
import * as TalexUtilsPlugin from '@talex-touch/utils/plugin'
import * as TalexUtilsPluginSdk from '@talex-touch/utils/plugin/sdk'
import * as TalexUtilsTypes from '@talex-touch/utils/types'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import * as Vue from 'vue'
import { registerCustomRenderer, unregisterCustomRenderer } from '~/modules/box/custom-render'

const injectedStyles = new Map<string, HTMLStyleElement>()
const transport = useTuffTransport()
const widgetRegisterEvent = defineRawEvent<WidgetRegistrationPayload, { widgetId: string }>(
  'plugin:widget:register'
)
const widgetUpdateEvent = defineRawEvent<WidgetRegistrationPayload, { widgetId: string }>(
  'plugin:widget:update'
)
const widgetUnregisterEvent = defineRawEvent<{ widgetId: string }, { widgetId: string }>(
  'plugin:widget:unregister'
)

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
const preloadedModuleCache: Record<string, any> = {
  vue: Vue,
  '@talex-touch/utils': TalexUtils,
  '@talex-touch/utils/plugin': TalexUtilsPlugin,
  '@talex-touch/utils/plugin/sdk': TalexUtilsPluginSdk,
  '@talex-touch/utils/core-box': TalexUtilsCoreBox,
  '@talex-touch/utils/channel': TalexUtilsChannel,
  '@talex-touch/utils/common': TalexUtilsCommon,
  '@talex-touch/utils/types': TalexUtilsTypes
}

/**
 * Create a sandboxed require function for widgets
 * 为 widget 创建沙箱化的 require 函数
 * @param allowedDependencies - List of allowed module names
 * @returns Safe require function
 * @throws Error if any declared dependency is not available
 */
function createSandboxRequire(allowedDependencies: string[]): (id: string) => any {
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
function evaluateWidgetComponent(code: string, dependencies: string[] = []): Component {
  const module: { exports: any } = { exports: {} }
  const customRequire = createSandboxRequire(dependencies)

  try {
    const executor = new Function('require', 'module', 'exports', code)
    executor(customRequire, module, module.exports)
  } catch (error) {
    console.error('[WidgetRegistry] Widget execution failed:', error)
    throw error
  }

  const exported = module.exports.default || module.exports

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

transport.on(widgetRegisterEvent, (payload) => {
  try {
    const component = evaluateWidgetComponent(payload.code, payload.dependencies || [])
    registerCustomRenderer(payload.widgetId, component)
    injectStyles(payload.widgetId, payload.styles)
    return { widgetId: payload.widgetId }
  } catch (error) {
    console.error('[WidgetRegistry] Widget registration failed', error)
    throw error
  }
})

transport.on(widgetUpdateEvent, (payload) => {
  try {
    const component = evaluateWidgetComponent(payload.code, payload.dependencies || [])
    registerCustomRenderer(payload.widgetId, component)
    injectStyles(payload.widgetId, payload.styles)
    return { widgetId: payload.widgetId }
  } catch (error) {
    console.error('[WidgetRegistry] Widget update failed', error)
    throw error
  }
})

transport.on(widgetUnregisterEvent, ({ widgetId }) => {
  try {
    unregisterCustomRenderer(widgetId)
    const style = injectedStyles.get(widgetId)
    if (style) {
      style.remove()
      injectedStyles.delete(widgetId)
    }
    return { widgetId }
  } catch (error) {
    console.error('[WidgetRegistry] Widget unregister failed', error)
    throw error
  }
})
