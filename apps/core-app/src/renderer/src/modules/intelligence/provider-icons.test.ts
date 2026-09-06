import { readFileSync } from 'node:fs'
import path from 'node:path'
import { IntelligenceProviderType } from '@talex-touch/utils/types/intelligence'
import { describe, expect, it } from 'vitest'
import { PROVIDER_ICON_CLASSES, providerIconFor } from './provider-icons'

describe('providerIconFor', () => {
  it.each([
    ['openai', 'i-simple-icons-openai'],
    ['anthropic', 'i-simple-icons-anthropic'],
    ['deepseek', 'i-carbon-search-advanced'],
    ['siliconflow', 'i-carbon-ibm-watson-machine-learning'],
    ['local', 'i-carbon-bare-metal-server'],
    ['custom', 'i-carbon-settings']
  ])('maps %s to its class icon', (type, value) => {
    expect(providerIconFor(type)).toEqual({ type: 'class', value })
  })

  it('falls back to the custom icon for a type outside the enum', () => {
    expect(providerIconFor('pi')).toEqual(providerIconFor('custom'))
    expect(providerIconFor('')).toEqual(providerIconFor('custom'))
  })

  it('does not resolve prototype members as icons', () => {
    expect(providerIconFor('constructor')).toEqual(providerIconFor('custom'))
    expect(providerIconFor('toString')).toEqual(providerIconFor('custom'))
  })
})

/**
 * The classes live in a `.ts` module, which UnoCSS never scans, so they reach the stylesheet
 * only through the safelist in `uno.config.ts`. The first regression was exactly that: the map
 * moved out of two `.vue` files and every provider icon became an empty box.
 */
describe('PROVIDER_ICON_CLASSES', () => {
  it('lists one class per provider type, and every one of them', () => {
    const types = Object.values(IntelligenceProviderType)
    expect(types).toHaveLength(6)
    expect(PROVIDER_ICON_CLASSES).toHaveLength(types.length)
    for (const type of types) {
      expect(PROVIDER_ICON_CLASSES).toContain(providerIconFor(type).value)
    }
    expect(PROVIDER_ICON_CLASSES).toEqual([
      'i-simple-icons-openai',
      'i-simple-icons-anthropic',
      'i-carbon-search-advanced',
      'i-carbon-ibm-watson-machine-learning',
      'i-carbon-bare-metal-server',
      'i-carbon-settings'
    ])
  })

  it('is spread into the UnoCSS safelist and watched by the dev server, not copied there', () => {
    // Read as text: evaluating the config would pull the icon collections and the UnoCSS
    // presets into a unit test, and the resolution of those is the dev server's, not vitest's.
    const unoConfig = readFileSync(path.resolve(__dirname, '../../../../../uno.config.ts'), 'utf8')
    expect(unoConfig).toMatch(
      /import \{ PROVIDER_ICON_CLASSES \} from '\.\/src\/renderer\/src\/modules\/intelligence\/provider-icons'/
    )
    expect(unoConfig).toMatch(/safelist: \[[^\]]*\.\.\.PROVIDER_ICON_CLASSES/)
    // The config is evaluated once per load, and the dev server watches only the files it is
    // told about. Without this module in `configDeps`, a new provider's icon would stay an empty
    // box until the next restart — the same defect one step removed.
    const binding =
      /const (\w+) = fileURLToPath\(\s*new URL\('\.\/src\/renderer\/src\/modules\/intelligence\/provider-icons\.ts', import\.meta\.url\)\s*\)/.exec(
        unoConfig
      )?.[1]
    expect(binding).toBeDefined()
    expect(unoConfig).toMatch(new RegExp(`configDeps: \\[[^\\]]*\\b${binding}\\b`))
    // A literal copy here would be the drift this module exists to prevent.
    for (const className of PROVIDER_ICON_CLASSES) {
      expect(unoConfig).not.toContain(`'${className}'`)
    }
  })
})
