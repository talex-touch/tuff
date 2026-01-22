import type { Component } from 'vue'
import { DEFAULT_WIDGET_RENDERERS } from '@talex-touch/utils/plugin'
import CoreIntelligenceAnswer from '~/components/render/custom/CoreIntelligenceAnswer.vue'
import PreviewResultCard from '~/components/render/custom/PreviewResultCard.vue'

const registry = new Map<string, Component>()
let defaultsRegistered = false

export function registerCustomRenderer(name: string, component: Component): void {
  registry.set(name, component)
}

export function getCustomRenderer(name: string): Component | undefined {
  return registry.get(name)
}

export function unregisterCustomRenderer(name: string): void {
  registry.delete(name)
}

export function registerDefaultCustomRenderers(): void {
  if (defaultsRegistered) return
  defaultsRegistered = true

  registerCustomRenderer(DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD, PreviewResultCard)
  registerCustomRenderer(DEFAULT_WIDGET_RENDERERS.CORE_INTELLIGENCE_ANSWER, CoreIntelligenceAnswer)
}
