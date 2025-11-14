import type { Component } from 'vue'
import PreviewResultCard from '~/components/render/custom/PreviewResultCard.vue'

const registry = new Map<string, Component>()
let defaultsRegistered = false

export function registerCustomRenderer(name: string, component: Component): void {
  registry.set(name, component)
}

export function getCustomRenderer(name: string): Component | undefined {
  return registry.get(name)
}

export function registerDefaultCustomRenderers(): void {
  if (defaultsRegistered) return
  defaultsRegistered = true

  registerCustomRenderer('core-preview-card', PreviewResultCard)
}
