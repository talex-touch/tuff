import type { Component } from 'vue'
import type { WidgetRegistrationPayload } from '@talex-touch/utils/plugin/widget'
import { DataCode } from '@talex-touch/utils/channel'
import { registerCustomRenderer, unregisterCustomRenderer } from '~/modules/box/custom-render'
import { touchChannel } from '~/modules/channel/channel-core'

const injectedStyles = new Map<string, HTMLStyleElement>()

// Pre-loaded module cache (initialized once at module load time)
const preloadedModuleCache: Record<string, any> = {
  'vue': require('vue'),
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
  '@talex-touch/utils/types',
]

// Preload all allowed modules at startup - failures are fatal
const preloadFailures: string[] = []
ALLOWED_PACKAGES.forEach((module) => {
  if (module in preloadedModuleCache) return // Already loaded (e.g., 'vue')
  try {
    preloadedModuleCache[module] = require(module)
  }
  catch (error) {
    console.error(`[WidgetSandbox] Failed to preload module "${module}":`, error)
    preloadFailures.push(module)
  }
})

if (preloadFailures.length > 0) {
  console.error(
    `[WidgetSandbox] FATAL: Failed to preload required modules: ${preloadFailures.join(', ')}. ` +
    'Widget functionality may be impaired.',
  )
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
      `Allowed packages: ${ALLOWED_PACKAGES.join(', ')}`,
    )
  }

  return function sandboxRequire(id: string) {
    if (!allowedDependencies.includes(id)) {
      throw new Error(
        `[WidgetSandbox] Module "${id}" is not allowed. Available modules: ${allowedDependencies.join(', ')}`,
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
  }
  catch (error) {
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
  if (!styles)
    return

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

touchChannel.regChannel('plugin:widget:register', ({ data, reply }) => {
  const payload = data as WidgetRegistrationPayload

  try {
    const component = evaluateWidgetComponent(payload.code, payload.dependencies || [])
    registerCustomRenderer(payload.widgetId, component)
    injectStyles(payload.widgetId, payload.styles)
    reply(DataCode.SUCCESS, { widgetId: payload.widgetId })
  }
  catch (error) {
    console.error('[WidgetRegistry] Widget registration failed', error)
    reply(DataCode.ERROR, { message: (error as Error).message })
  }
})

touchChannel.regChannel('plugin:widget:update', ({ data, reply }) => {
  const payload = data as WidgetRegistrationPayload

  try {
    const component = evaluateWidgetComponent(payload.code, payload.dependencies || [])
    registerCustomRenderer(payload.widgetId, component)
    injectStyles(payload.widgetId, payload.styles)
    reply(DataCode.SUCCESS, { widgetId: payload.widgetId })
  }
  catch (error) {
    console.error('[WidgetRegistry] Widget update failed', error)
    reply(DataCode.ERROR, { message: (error as Error).message })
  }
})

touchChannel.regChannel('plugin:widget:unregister', ({ data, reply }) => {
  const { widgetId } = data as { widgetId: string }

  try {
    unregisterCustomRenderer(widgetId)
    const style = injectedStyles.get(widgetId)
    if (style) {
      style.remove()
      injectedStyles.delete(widgetId)
    }
    reply(DataCode.SUCCESS, { widgetId })
  }
  catch (error) {
    console.error('[WidgetRegistry] Widget unregister failed', error)
    reply(DataCode.ERROR, { message: (error as Error).message })
  }
})
