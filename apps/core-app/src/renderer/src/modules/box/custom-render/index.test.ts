import type { Component } from 'vue'
import { h } from 'vue'
import { describe, expect, it } from 'vitest'
import { DEFAULT_WIDGET_RENDERERS } from '@talex-touch/utils/plugin'
import {
  getCustomRenderer,
  getCustomRendererVersion,
  registerCustomRenderer,
  registerDefaultCustomRenderers,
  unregisterCustomRenderer
} from './index'

function createTestRenderer(label: string): Component {
  return {
    name: `TestRenderer${label}`,
    render: () => h('div', label)
  }
}

describe('custom-render registry', () => {
  it('registers default renderers idempotently', () => {
    registerDefaultCustomRenderers()
    const previewRenderer = getCustomRenderer(DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD)
    const previewVersion = getCustomRendererVersion(DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD)

    registerDefaultCustomRenderers()

    expect(getCustomRenderer(DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD)).toBe(previewRenderer)
    expect(getCustomRendererVersion(DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD)).toBe(
      previewVersion
    )
    expect(getCustomRenderer(DEFAULT_WIDGET_RENDERERS.CORE_INTELLIGENCE_ANSWER)).toBeTruthy()
  })

  it('keeps default renderers registered when unregister is requested', () => {
    registerDefaultCustomRenderers()
    const previewRenderer = getCustomRenderer(DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD)

    unregisterCustomRenderer(DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD)

    expect(getCustomRenderer(DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD)).toBe(previewRenderer)
  })

  it('does not allow dynamic widgets to override default renderer ids', () => {
    registerDefaultCustomRenderers()
    const previewRenderer = getCustomRenderer(DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD)

    registerCustomRenderer(
      DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD,
      createTestRenderer('Override')
    )

    expect(getCustomRenderer(DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD)).toBe(previewRenderer)
  })

  it('still allows dynamic widget renderers to register and unregister', () => {
    const widgetId = 'test-plugin::widget'
    const renderer = createTestRenderer('Dynamic')

    registerCustomRenderer(widgetId, renderer)
    expect(getCustomRenderer(widgetId)).toBe(renderer)

    unregisterCustomRenderer(widgetId)
    expect(getCustomRenderer(widgetId)).toBeUndefined()
  })
})
