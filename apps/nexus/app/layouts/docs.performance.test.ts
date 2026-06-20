import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const layout = readFileSync(new URL('./docs.vue', import.meta.url), 'utf8')

describe('docs layout performance boundaries', () => {
  it('keeps the decorative TuffEx hero background off the SSR critical path', () => {
    expect(layout).toContain('defineAsyncComponent')
    expect(layout).toContain("import('~/components/docs/TuffexDocsHeroBackground.vue')")
    expect(layout).toContain('TUFFEX_DOCS_BACKGROUND_DELAY_MS = 2500')
    expect(layout).toContain('TUFFEX_DOCS_BACKGROUND_IDLE_TIMEOUT_MS = 1800')
    expect(layout).toContain('shouldMountTuffexBackground')
    expect(layout).toContain('requestIdleCallback')
    expect(layout).toContain('watch(isTuffexDocs')
    expect(layout).toMatch(/if \(active\) \{[\s\S]*scheduleTuffexBackground\(\)/)
    expect(layout).toMatch(/clearTuffexBackgroundSchedule\(\)[\s\S]*shouldMountTuffexBackground\.value = false/)
    expect(layout).toContain('<ClientOnly>')
    expect(layout).toContain('<TuffexDocsHeroBackground v-if="shouldMountTuffexBackground"')
    expect(layout).not.toContain("import TuffexDocsHeroBackground from '~/components/docs/TuffexDocsHeroBackground.vue'")
  })

  it('uses static edge blur chrome instead of SSR-rendering TuffEx blur components', () => {
    expect(layout).not.toContain('@talex-touch/tuffex/gradual-blur')
    expect(layout).not.toContain('<TxGradualBlur')
    expect(layout).toContain('class="docs-edge-blur docs-edge-blur--top"')
    expect(layout).toContain('class="docs-edge-blur docs-edge-blur--bottom"')
  })
})
