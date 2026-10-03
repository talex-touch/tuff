import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import unoConfig from '../../uno.config'
import { normalizeCoreBoxIcon } from '../renderer/src/components/render/icon-color-mode'
import { BUILTIN_FLOW_TARGET_ICON_CLASSES } from './flow-target-icons'

const nodeRequire = createRequire(import.meta.url)

function readMainModule(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../main/modules/${relativePath}`, import.meta.url)),
    'utf8'
  )
}

/**
 * What each `<property>: …` line in a piece of source assigns, as written. Matched line by line,
 * so a match never runs on into a neighbouring declaration.
 */
function propertyValues(source: string, property: 'icon' | 'pluginIcon'): string[] {
  return [...source.matchAll(new RegExp(`^[ \\t]*${property}: (.+?),?$`, 'gm'))].map(
    (match) => match[1]!
  )
}

/** The body of each `const …: FlowTarget = {` declaration, up to the `}` closing it at column 0. */
function flowTargetDeclarations(source: string): string[] {
  return [...source.matchAll(/^const \w+: FlowTarget = \{$([\s\S]*?)^\}$/gm)].map(
    (match) => match[1]!
  )
}

/** The body of `getAvailableTargets()`, every platform branch, up to the method's own `}`. */
function availableTargetsMethod(source: string): string {
  return (
    /^ {2}getAvailableTargets\(\): FlowTarget\[\] \{$([\s\S]*?)^ {2}\}$/m.exec(source)?.[1] ?? ''
  )
}

/**
 * The icons the built-in Flow targets declare, as written: the targets' own, from the QuickOps
 * `FlowTarget` declarations and the native share targets, and the `pluginIcon` each group
 * registers under. Kept apart so that each extraction has its own positive control.
 */
function declaredIcons(): { targets: string[]; pluginIcons: string[] } {
  const quickOps = readMainModule('quick-ops/index.ts')
  return {
    targets: [
      ...flowTargetDeclarations(quickOps).flatMap((body) => propertyValues(body, 'icon')),
      ...propertyValues(availableTargetsMethod(readMainModule('flow-bus/native-share.ts')), 'icon')
    ],
    pluginIcons: [
      ...propertyValues(quickOps, 'pluginIcon'),
      ...propertyValues(readMainModule('flow-bus/module.ts'), 'pluginIcon')
    ]
  }
}

describe('built-in Flow target icons', () => {
  const declared = declaredIcons()
  const values = [...declared.targets, ...declared.pluginIcons]

  it('finds icons in every source it reads', () => {
    // The positive control: an extraction that stopped matching would leave nothing to check, and
    // every test below would pass on an empty list.
    expect(declared.targets).toEqual(
      expect.arrayContaining(["'ri:tools-line'", "'ri:folder-open-line'", "'ri:share-line'"])
    )
    expect(declared.pluginIcons).toEqual(
      expect.arrayContaining(["'ri:tools-line'", "'ri:share-forward-line'"])
    )
  })

  it('declares each as a plain string, the only form this list can follow', () => {
    for (const value of values) {
      expect(value).toMatch(/^'[^']+'$/)
    }
  })

  it('lists the class each declared icon renders as', () => {
    for (const value of values) {
      const icon = normalizeCoreBoxIcon(value.slice(1, -1))
      expect(icon.type, value).toBe('class')
      expect(BUILTIN_FLOW_TARGET_ICON_CLASSES, value).toContain(icon.value)
    }
  })

  it('names only glyphs the installed Remix Icon set has', () => {
    const set = JSON.parse(
      readFileSync(nodeRequire.resolve('@iconify-json/ri/icons.json'), 'utf8')
    ) as { icons: Record<string, unknown>; aliases?: Record<string, unknown> }
    const names = new Set([...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})])

    const missing = BUILTIN_FLOW_TARGET_ICON_CLASSES.filter(
      (className) => !className.startsWith('i-ri-') || !names.has(className.slice('i-ri-'.length))
    )

    expect(missing).toEqual([])
  })

  it('reaches the UnoCSS safelist, and the dev server reloads when it changes', () => {
    for (const className of BUILTIN_FLOW_TARGET_ICON_CLASSES) {
      expect(unoConfig.safelist).toContain(className)
    }
    expect(unoConfig.configDeps).toContain(
      fileURLToPath(new URL('./flow-target-icons.ts', import.meta.url))
    )
  })
})
