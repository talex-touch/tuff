import { ref, type Component } from 'vue'
import { DEFAULT_WIDGET_RENDERERS } from '@talex-touch/utils/plugin'
import CoreIntelligenceAnswer from '~/components/render/custom/CoreIntelligenceAnswer.vue'
import PreviewResultCard from '~/components/render/custom/PreviewResultCard.vue'

const registry = new Map<string, Component>()
const rendererVersions = new Map<string, number>()
const registryVersion = ref(0)

function bumpRendererVersion(name: string): void {
  const current = rendererVersions.get(name) ?? 0
  rendererVersions.set(name, current + 1)
  registryVersion.value += 1
}
let defaultsRegistered = false

export function registerCustomRenderer(name: string, component: Component): void {
  registry.set(name, component)
  bumpRendererVersion(name)
}

export function getCustomRenderer(name: string): Component | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  registryVersion.value
  return registry.get(name)
}

export function unregisterCustomRenderer(name: string): void {
  registry.delete(name)
  rendererVersions.delete(name)
  registryVersion.value += 1
}

export function getCustomRendererVersion(name: string): number {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  registryVersion.value
  return rendererVersions.get(name) ?? 0
}

export function registerDefaultCustomRenderers(): void {
  if (defaultsRegistered) return
  defaultsRegistered = true

  registerCustomRenderer(DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD, PreviewResultCard)
  registerCustomRenderer(DEFAULT_WIDGET_RENDERERS.CORE_INTELLIGENCE_ANSWER, CoreIntelligenceAnswer)
}
