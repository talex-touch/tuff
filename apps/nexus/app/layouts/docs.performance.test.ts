import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const layout = readFileSync(new URL('./docs.vue', import.meta.url), 'utf8')

describe('docs layout performance boundaries', () => {
  it('keeps evicted TuffEx component docs modules out of the Nexus docs layout', () => {
    expect(layout).not.toContain('TuffexDocsHeroBackground')
    expect(layout).not.toContain('DocsFrameworkSwitcher')
    expect(layout).not.toContain('tuffex-component-slug')
  })

  it('uses pure CSS linear-gradient edge scrims with zero fixed backdrop-filter blur layers', () => {
    expect(layout).not.toContain('@talex-touch/tuffex/gradual-blur')
    expect(layout).not.toContain('<TxGradualBlur')
    expect(layout).not.toContain('docs-edge-blur__layer')
    expect(layout).not.toContain('backdrop-filter')
    expect(layout).toContain('class="docs-edge-blur docs-edge-blur--top"')
    expect(layout).toContain('class="docs-edge-blur docs-edge-blur--bottom"')
    expect(layout).toContain('--docs-edge-bottom-height')
    expect(layout).toContain('linear-gradient(')
  })

  it('keeps footer and back-to-top deferred off the initial render path', () => {
    expect(layout).toContain("defineAsyncComponent(() => import('~/components/TuffFooter.vue'))")
    expect(layout).toContain("defineAsyncComponent(() => import('~/components/ui/BackToTop.vue'))")
    expect(layout).toContain('IntersectionObserver')
  })
})
