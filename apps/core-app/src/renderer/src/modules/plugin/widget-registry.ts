import type { Component } from 'vue'
import type { WidgetRegistrationPayload } from '@talex-touch/utils/plugin/widget'
import { DataCode } from '@talex-touch/utils/channel'
import { registerCustomRenderer, unregisterCustomRenderer } from '~/modules/box/custom-render'
import { touchChannel } from '~/modules/channel/channel-core'

const injectedStyles = new Map<string, HTMLStyleElement>()

function evaluateWidgetComponent(code: string): Component {
  const module: { exports: any } = { exports: {} }
  const executor = new Function('require', 'module', 'exports', code)
  executor(require, module, module.exports)
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
    const component = evaluateWidgetComponent(payload.code)
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
    const component = evaluateWidgetComponent(payload.code)
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
