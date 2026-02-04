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
    component: import('~/views/layout/simple/SimpleLayout.vue')
  },
  flat: {
    name: 'flat',
    displayName: 'Flat Layout',
    component: import('~/views/layout/flat/FlatLayout.vue')
  },
  compact: {
    name: 'compact',
    displayName: 'Compact Layout',
    component: import('~/views/layout/compact/CompactLayout.vue')
  },
  minimal: {
    name: 'minimal',
    displayName: 'Minimal Layout',
    component: import('~/views/layout/minimal/MinimalLayout.vue')
  },
  classic: {
    name: 'classic',
    displayName: 'Classic Layout',
    component: import('~/views/layout/classic/ClassicLayout.vue')
  },
  card: {
    name: 'card',
    displayName: 'Card Layout',
    component: import('~/views/layout/card/CardLayout.vue')
  },
  dock: {
    name: 'dock',
    displayName: 'Dock Layout',
    component: import('~/views/layout/dock/DockLayout.vue')
  },
  custom: {
    name: 'custom',
    displayName: 'Custom',
    component: import('~/views/layout/simple/SimpleLayout.vue')
  }
} as Record<string, LayoutConfig>
