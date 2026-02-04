import type { LayoutAtomConfig } from '@talex-touch/utils'

export const LAYOUT_PRESET_KEYS = [
  'simple',
  'flat',
  'compact',
  'minimal',
  'classic',
  'card',
  'dock'
] as const

export type LayoutPresetKey = (typeof LAYOUT_PRESET_KEYS)[number]

export const layoutAtomPresets: Record<LayoutPresetKey, LayoutAtomConfig> = {
  simple: {
    preset: 'simple',
    header: { border: 'solid', opacity: 1, height: 26, blur: false },
    aside: { position: 'left', width: 68, border: 'solid', opacity: 0.5, collapsed: false },
    view: { radius: [0, 0, 0, 0], shadow: 'none', padding: 0, background: 'transparent' },
    nav: { style: 'icon', activeIndicator: 'dot' }
  },
  flat: {
    preset: 'flat',
    header: { border: 'none', opacity: 0.75, height: 28, blur: false },
    aside: { position: 'left', width: 64, border: 'none', opacity: 0, collapsed: false },
    view: { radius: [8, 0, 0, 0], shadow: 'none', padding: 6, background: 'transparent' },
    nav: { style: 'icon', activeIndicator: 'bar' }
  },
  compact: {
    preset: 'compact',
    header: { border: 'solid', opacity: 1, height: 24, blur: false },
    aside: { position: 'left', width: 36, border: 'solid', opacity: 0.4, collapsed: false },
    view: { radius: [0, 0, 0, 0], shadow: 'none', padding: 4, background: 'transparent' },
    nav: { style: 'icon', activeIndicator: 'dot' }
  },
  minimal: {
    preset: 'minimal',
    header: { border: 'none', opacity: 0.9, height: 28, blur: false },
    aside: { position: 'hidden', width: 0, border: 'none', opacity: 0, collapsed: true },
    view: { radius: [0, 0, 0, 0], shadow: 'none', padding: 0, background: 'transparent' },
    nav: { style: 'icon', activeIndicator: 'background' }
  },
  classic: {
    preset: 'classic',
    header: { border: 'solid', opacity: 1, height: 40, blur: false },
    aside: { position: 'hidden', width: 0, border: 'none', opacity: 0, collapsed: true },
    view: { radius: [0, 0, 0, 0], shadow: 'none', padding: 0, background: 'transparent' },
    nav: { style: 'text', activeIndicator: 'bar' }
  },
  card: {
    preset: 'card',
    header: { border: 'none', opacity: 1, height: 32, blur: false },
    aside: { position: 'left', width: 72, border: 'none', opacity: 0, collapsed: false },
    view: { radius: [12, 12, 12, 12], shadow: 'md', padding: 12, background: 'solid' },
    nav: { style: 'icon-text', activeIndicator: 'background' }
  },
  dock: {
    preset: 'dock',
    header: { border: 'none', opacity: 0.85, height: 26, blur: false },
    aside: { position: 'bottom', width: 56, border: 'none', opacity: 0, collapsed: false },
    view: { radius: [8, 8, 0, 0], shadow: 'none', padding: 8, background: 'transparent' },
    nav: { style: 'icon', activeIndicator: 'dot' }
  }
}

export function getLayoutAtomPreset(key: LayoutPresetKey): LayoutAtomConfig {
  return layoutAtomPresets[key]
}

export function isLayoutPresetKey(key: string): key is LayoutPresetKey {
  return LAYOUT_PRESET_KEYS.includes(key as LayoutPresetKey)
}
