import { describe, expect, it } from 'vitest'
import { expandStyleClosure, tuffexOnDemandStylePlugin } from '../on-demand-style-plugin'

const styleDeps = {
  'progress-bar': ['tooltip', 'spinner'],
  'tooltip': ['base-anchor'],
  'base-anchor': ['base-surface'],
  'dialog': ['base-surface'],
}

function transform(code: string, id = '/app/src/page.vue') {
  const plugin = tuffexOnDemandStylePlugin({ styleDeps })
  const handler = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  return (handler as (code: string, id: string) => { code: string } | null)?.call({}, code, id) ?? null
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
