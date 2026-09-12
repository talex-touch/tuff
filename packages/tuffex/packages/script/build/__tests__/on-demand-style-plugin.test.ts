import type { TuffexOnDemandStylePluginOptions } from '../on-demand-style-plugin'
import { describe, expect, it } from 'vitest'
import { expandStyleClosure, tuffexOnDemandStylePlugin } from '../on-demand-style-plugin'

const styleDeps = {
  'progress-bar': ['tooltip', 'spinner'],
  'tooltip': ['base-anchor'],
  'base-anchor': ['base-surface'],
  'dialog': ['base-surface'],
}

function transform(
  code: string,
  id = '/app/src/page.vue',
  options: TuffexOnDemandStylePluginOptions = {},
) {
  const plugin = tuffexOnDemandStylePlugin({ styleDeps, ...options })
  const handler = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  return (handler as (code: string, id: string) => { code: string } | null)?.call({}, code, id) ?? null
}

/**
 * Every TuffEx stylesheet the transform emitted, in the order it emitted them.
 * Matches the specifier rather than the whole statement, so a formatting change
 * cannot make a suppression assertion pass for the wrong reason.
 */
function injectedStyleComponents(result: { code: string } | null): string[] {
  return [...(result?.code ?? '').matchAll(/@talex-touch\/tuffex\/([a-z0-9-]+)\/style\.css/g)]
    .map(match => match[1])
    .filter((name): name is string => Boolean(name))
}

describe('expandStyleClosure', () => {
  it('lists dependencies before the component that leans on them', () => {
    // Post-order, so a component's own rules land later in the cascade and win
    // against what it builds on.
    expect(expandStyleClosure(['progress-bar'], styleDeps)).toEqual([
      'base-surface',
      'base-anchor',
      'tooltip',
      'spinner',
      'progress-bar',
    ])
  })

  it('names a shared dependency once across several components', () => {
    // base-surface is reached through both progress-bar and dialog; emitting it
    // twice is exactly the duplication this replaced.
    const ordered = expandStyleClosure(['progress-bar', 'dialog'], styleDeps)

    expect(ordered.filter(name => name === 'base-surface')).toHaveLength(1)
    expect(ordered.indexOf('base-surface')).toBeLessThan(ordered.indexOf('dialog'))
    expect(new Set(ordered).size).toBe(ordered.length)
  })

  it('survives a cycle instead of recursing forever', () => {
    const cyclic = { a: ['b'], b: ['c'], c: ['a'] }

    const ordered = expandStyleClosure(['a'], cyclic)
    expect(new Set(ordered)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('passes through a component the graph says nothing about', () => {
    expect(expandStyleClosure(['unknown'], styleDeps)).toEqual(['unknown'])
  })
})

describe('tuffexOnDemandStylePlugin', () => {
  it('injects the whole closure for one component import', () => {
    const result = transform(`import { TxProgressBar } from '@talex-touch/tuffex/progress-bar'\n`)

    expect(result?.code.split('\n').slice(0, 5)).toEqual([
      `import '@talex-touch/tuffex/base-surface/style.css';`,
      `import '@talex-touch/tuffex/base-anchor/style.css';`,
      `import '@talex-touch/tuffex/tooltip/style.css';`,
      `import '@talex-touch/tuffex/spinner/style.css';`,
      `import '@talex-touch/tuffex/progress-bar/style.css';`,
    ])
  })

  it('leaves a stylesheet the author already imported alone', () => {
    const code = [
      `import '@talex-touch/tuffex/tooltip/style.css'`,
      `import { TxProgressBar } from '@talex-touch/tuffex/progress-bar'`,
      ``,
    ].join('\n')

    const result = transform(code)
    const injected = result?.code.split('\n').filter(line => line.startsWith('import \'@talex-touch'))

    expect(injected).not.toContain(`import '@talex-touch/tuffex/tooltip/style.css';`)
    expect(injected).toContain(`import '@talex-touch/tuffex/progress-bar/style.css';`)
  })

  it('ignores files that never mention the library', () => {
    expect(transform(`import { ref } from 'vue'\n`)).toBeNull()
  })

  it('is inert when disabled', () => {
    const plugin = tuffexOnDemandStylePlugin({ enabled: false, styleDeps })
    const handler = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
    const result = (handler as (code: string, id: string) => unknown)
      .call({}, `import { TxProgressBar } from '@talex-touch/tuffex/progress-bar'\n`, '/app/src/page.vue')

    expect(result).toBeNull()
  })
})

describe('tuffexOnDemandStylePlugin with componentDistRoot', () => {
  const componentDistRoot = '/workspace/packages/tuffex/dist/es'

  // A real built entry (`dist/es/progress-bar/index.js`) imports its neighbours
  // relatively and never names `@talex-touch/tuffex/...`, so the entry has to be
  // recognised by its path — otherwise no built component would get its styles.
  const builtEntry = [
    `import { withInstall } from '../utils/withInstall.js'`,
    `import _sfc_main from './src/TxProgressBar.vue.js'`,
    ``,
    `export default withInstall(_sfc_main)`,
    ``,
  ].join('\n')

  // What a generated Nuxt registry does: one dynamic import per component.
  const nuxtRegistry = [
    `export default {`,
    `  TxProgressBar: () => import('@talex-touch/tuffex/progress-bar'),`,
    `  TxTooltip: () => import('@talex-touch/tuffex/tooltip'),`,
    `  TxDialog: () => import('@talex-touch/tuffex/dialog'),`,
    `}`,
    ``,
  ].join('\n')

  it('injects the complete closure into a built component entry', () => {
    const result = transform(builtEntry, `${componentDistRoot}/progress-bar/index.js`, { componentDistRoot })

    expect(injectedStyleComponents(result)).toEqual([
      'base-surface',
      'base-anchor',
      'tooltip',
      'spinner',
      'progress-bar',
    ])
  })

  it('leaves a generated .nuxt module to load styles with each component chunk', () => {
    const result = transform(nuxtRegistry, '/workspace/app/.nuxt/components.plugin.mjs', { componentDistRoot })

    expect(injectedStyleComponents(result)).toEqual([])
  })

  it('leaves a Nuxt app runtime module to load styles with each component chunk', () => {
    const result = transform(
      nuxtRegistry,
      '/workspace/app/node_modules/nuxt/dist/app/components.plugin.mjs',
      { componentDistRoot },
    )

    expect(injectedStyleComponents(result)).toEqual([])
  })

  it('keeps fanning out for a Nuxt module when no dist root is configured', () => {
    // The control for the two suppression cases above: the same registry does get
    // the global fan-out unless `componentDistRoot` opts into the split.
    const result = transform(nuxtRegistry, '/workspace/app/.nuxt/components.plugin.mjs')

    expect(injectedStyleComponents(result)).toEqual([
      'base-surface',
      'dialog',
      'base-anchor',
      'tooltip',
      'spinner',
      'progress-bar',
    ])
  })

  it('leaves an ordinary importer untouched in component-entry mode', () => {
    // With `componentDistRoot` set the plugin is component-entry-only: a page that
    // names a dozen components must not drag the whole closure into the entry chunk.
    const result = transform(
      `import { TxDialog } from '@talex-touch/tuffex/dialog'\n`,
      '/app/src/page.vue',
      { componentDistRoot },
    )

    expect(injectedStyleComponents(result)).toEqual([])
  })
})
