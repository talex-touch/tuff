import { describe, expect, it } from 'vitest'
import { dedupeDevTuffexStylesheets } from './devStylesheetDedupe'

describe('dedupeDevTuffexStylesheets', () => {
  it('deduplicates equivalent @fs and absolute TuffEx stylesheet links', () => {
    const html = [
      '<link rel="stylesheet" href="/_nuxt/@fs/Users/me/talex-touch/packages/tuffex/packages/components/src/button/src/style/index.scss">',
      '<link rel="stylesheet" href="/_nuxt/Users/me/talex-touch/packages/tuffex/packages/components/src/button/src/style/index.scss">',
      '<link rel="stylesheet" href="/_nuxt/components/Foo.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/Foo.vue?vue&type=style&index=1&lang.css">',
    ].join('')

    expect(dedupeDevTuffexStylesheets(html)).toBe([
      '<link rel="stylesheet" href="/_nuxt/@fs/Users/me/talex-touch/packages/tuffex/packages/components/src/button/src/style/index.scss">',
      '<link rel="stylesheet" href="/_nuxt/components/Foo.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/Foo.vue?vue&type=style&index=1&lang.css">',
    ].join(''))
  })

  it('keeps distinct TuffEx vue style queries', () => {
    const html = [
      '<link rel="stylesheet" href="/_nuxt/@fs/Users/me/talex-touch/packages/tuffex/packages/components/src/card/src/TxCard.vue?vue&type=style&index=0&lang.scss">',
      '<link rel="stylesheet" href="/_nuxt/Users/me/talex-touch/packages/tuffex/packages/components/src/card/src/TxCard.vue?vue&type=style&index=1&lang.scss">',
    ].join('')

    expect(dedupeDevTuffexStylesheets(html)).toBe(html)
  })
})
