import { ref, type Component } from 'vue'
import { DEFAULT_WIDGET_RENDERERS } from '@talex-touch/utils/plugin'
import CoreIntelligenceAnswer from '~/components/render/custom/CoreIntelligenceAnswer.vue'
import PreviewResultCard from '~/components/render/custom/PreviewResultCard.vue'

const registry = new Map<string, Component>()
const rendererVersions = new Map<string, number>()
const registryVersion = ref(0)
const defaultRenderers = new Map<string, Component>([
  [DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD, PreviewResultCard],
  [DEFAULT_WIDGET_RENDERERS.CORE_INTELLIGENCE_ANSWER, CoreIntelligenceAnswer]
])

function bumpRendererVersion(name: string): void {
  const current = rendererVersions.get(name) ?? 0
  rendererVersions.set(name, current + 1)
  registryVersion.value += 1
}

function setRenderer(name: string, component: Component): void {
  if (registry.get(name) === component) return
  registry.set(name, component)
  bumpRendererVersion(name)
}

function getDefaultRenderer(name: string): Component | undefined {
  return defaultRenderers.get(name)
}

export function registerCustomRenderer(name: string, component: Component): void {
  const defaultRenderer = getDefaultRenderer(name)
  if (defaultRenderer) {
    setRenderer(name, defaultRenderer)
    return
  }
  setRenderer(name, component)
}

export function getCustomRenderer(name: string): Component | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  registryVersion.value
  return registry.get(name) ?? getDefaultRenderer(name)
}

export function unregisterCustomRenderer(name: string): void {
  if (getDefaultRenderer(name)) return
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
  for (const [name, component] of defaultRenderers) {
    setRenderer(name, component)
  }
}
