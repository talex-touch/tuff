import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import unoConfig from '../../uno.config'
import { OMNI_PANEL_BUILTIN_FEATURE_DEFINITIONS } from '../main/modules/omni-panel/omni-panel-builtin-features'
import { OMNI_PANEL_BUILTIN_ICON_CLASSES } from './omni-panel-builtin-icons'

const nodeRequire = createRequire(import.meta.url)

describe('OmniPanel built-in feature icons', () => {
  it('lists the class each built-in feature declares', () => {
    expect(OMNI_PANEL_BUILTIN_FEATURE_DEFINITIONS.length).toBeGreaterThan(0)
    for (const feature of OMNI_PANEL_BUILTIN_FEATURE_DEFINITIONS) {
      expect(feature.icon.type, feature.id).toBe('class')
      expect(OMNI_PANEL_BUILTIN_ICON_CLASSES, feature.id).toContain(feature.icon.value)
    }
  })

  it('names only glyphs the installed Remix Icon set has', () => {
    const set = JSON.parse(
      readFileSync(nodeRequire.resolve('@iconify-json/ri/icons.json'), 'utf8')
    ) as { icons: Record<string, unknown>; aliases?: Record<string, unknown> }
    const names = new Set([...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})])

    const missing = OMNI_PANEL_BUILTIN_ICON_CLASSES.filter(
      (className) => !className.startsWith('i-ri-') || !names.has(className.slice('i-ri-'.length))
    )

    expect(missing).toEqual([])
  })

  it('reaches the UnoCSS safelist, and the dev server reloads when it changes', () => {
    for (const className of OMNI_PANEL_BUILTIN_ICON_CLASSES) {
      expect(unoConfig.safelist).toContain(className)
    }
    expect(unoConfig.configDeps).toContain(
      fileURLToPath(new URL('./omni-panel-builtin-icons.ts', import.meta.url))
    )
  })
})
