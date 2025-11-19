import type { Component } from 'vue'

export interface LayoutConfig {
  name: string
  displayName: string
  component: Promise<{ default: Component }>
}

export default {
  simple: {
    name: 'simple',
    displayName: 'Simple Layout',
    component: import('~/views/layout/simple/SimpleLayout.vue'),
  },
  flat: {
    name: 'flat',
    displayName: 'Flat Layout',
    component: import('~/views/layout/flat/FlatLayout.vue'),
  },
} as Record<string, LayoutConfig>
