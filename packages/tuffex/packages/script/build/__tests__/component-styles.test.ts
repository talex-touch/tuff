import { describe, expect, it } from 'vitest'
import { collectCssAssets } from '../component-styles'

/**
 * Shapes a fake Rollup output the way the real style build produces one: entry
 * chunks per component, plus the shared chunks their SFCs land in.
 */
function output(...items: Record<string, unknown>[]) {
  return { output: items } as never
}

function chunk(fileName: string, opts: Record<string, unknown> = {}) {
  return { type: 'chunk', fileName, ...opts }
}

function asset(fileName: string, source: string) {
  return { type: 'asset', fileName, source }
}

describe('collectCssAssets', () => {
  const names = new Set(['progress-bar', 'tooltip'])

  it('keeps a component to its own rules and names the siblings it leans on', () => {
    const parts = collectCssAssets(
      output(
        asset('pb.css', '.tx-progress-bar{}'),
        asset('tip.css', '.tx-tooltip{}'),
        chunk('progress-bar.js', {
          isEntry: true,
          name: 'progress-bar',
          modules: { '/x/src/progress-bar/index.ts': {} },
          imports: ['assets/TxProgressBar.js', 'assets/TxTooltip.js'],
        }),
        chunk('assets/TxProgressBar.js', {
          modules: { '/x/src/progress-bar/src/TxProgressBar.vue': {} },
          viteMetadata: { importedCss: ['pb.css'] },
        }),
        chunk('assets/TxTooltip.js', {
          modules: { '/x/src/tooltip/src/TxTooltip.vue': {} },
          viteMetadata: { importedCss: ['tip.css'] },
        }),
      ),
      names,
    )

    const pb = parts.get('progress-bar')
    // The tooltip's rules used to be copied in here; now only its name is.
    expect(pb?.own).toEqual(['.tx-progress-bar{}'])
    expect(pb?.deps).toEqual(['tooltip'])
  })

  it('walks through shared chunks that belong to no component', () => {
    const parts = collectCssAssets(
      output(
        asset('pb.css', '.tx-progress-bar{}'),
        chunk('progress-bar.js', {
          isEntry: true,
          name: 'progress-bar',
          modules: { '/x/src/progress-bar/index.ts': {} },
          imports: ['assets/helper.js'],
        }),
        // A util chunk owns no component, so the walk must not stop at it.
        chunk('assets/helper.js', {
          modules: { '/x/utils/withInstall.ts': {} },
          imports: ['assets/TxProgressBar.js'],
        }),
        chunk('assets/TxProgressBar.js', {
          modules: { '/x/src/progress-bar/src/TxProgressBar.vue': {} },
          viteMetadata: { importedCss: ['pb.css'] },
        }),
      ),
      names,
    )

    expect(parts.get('progress-bar')?.own).toEqual(['.tx-progress-bar{}'])
    expect(parts.get('progress-bar')?.deps).toEqual([])
  })

  it('reports each sibling once and in a stable order', () => {
    const parts = collectCssAssets(
      output(
        asset('tip.css', '.tx-tooltip{}'),
        chunk('progress-bar.js', {
          isEntry: true,
          name: 'progress-bar',
          modules: { '/x/src/progress-bar/index.ts': {} },
          // The same component reached twice, by two different routes.
          imports: ['tooltip.js', 'assets/TxTooltip.js'],
        }),
        chunk('tooltip.js', { isEntry: true, name: 'tooltip', modules: { '/x/src/tooltip/index.ts': {} } }),
        chunk('assets/TxTooltip.js', {
          modules: { '/x/src/tooltip/src/TxTooltip.vue': {} },
          viteMetadata: { importedCss: ['tip.css'] },
        }),
      ),
      names,
    )

    expect(parts.get('progress-bar')?.deps).toEqual(['tooltip'])
    expect(parts.get('progress-bar')?.own).toEqual([])
  })
})
