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

  it('removes route-local marketing, store, and dashboard styles from docs dev html', () => {
    const html = [
      '<link rel="stylesheet" href="/_nuxt/pages/docs/[...slug].vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/docs/DocHero.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/TuffFooter.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/pages/store.vue?vue&type=style&index=0&lang.scss">',
      '<link rel="stylesheet" href="/_nuxt/components/store/StoreItem.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/dashboard/DashboardNav.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/tuff/TuffHome.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/tuff/landing/TuffLandingNexusHero.vue?vue&type=style&index=0&lang.css">',
    ].join('')

    expect(dedupeDevTuffexStylesheets(html, '/en/docs/dev/components/tabs')).toBe([
      '<link rel="stylesheet" href="/_nuxt/pages/docs/[...slug].vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/docs/DocHero.vue?vue&type=style&index=0&lang.css">',
    ].join(''))
  })

  it('keeps store styles while removing unrelated dashboard and landing styles from store dev html', () => {
    const html = [
      '<link rel="stylesheet" href="/_nuxt/pages/store.vue?vue&type=style&index=0&lang.scss">',
      '<link rel="stylesheet" href="/_nuxt/components/store/StoreItem.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/layouts/store.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/tuff/background/TouchRay.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/dashboard/DashboardNav.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/tuff/TuffHome.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/tuff/landing/TuffLandingNexusHero.vue?vue&type=style&index=0&lang.css">',
    ].join('')

    expect(dedupeDevTuffexStylesheets(html, '/store')).toBe([
      '<link rel="stylesheet" href="/_nuxt/pages/store.vue?vue&type=style&index=0&lang.scss">',
      '<link rel="stylesheet" href="/_nuxt/components/store/StoreItem.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/layouts/store.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/tuff/background/TouchRay.vue?vue&type=style&index=0&lang.css">',
    ].join(''))
  })

  it('keeps landing styles while removing unrelated store and dashboard styles from landing dev html', () => {
    const html = [
      '<link rel="stylesheet" href="/_nuxt/components/tuff/TuffHome.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/tuff/landing/TuffLandingNexusHero.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/dashboard/DashboardNav.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/pages/store.vue?vue&type=style&index=0&lang.scss">',
      '<link rel="stylesheet" href="/_nuxt/components/store/StoreItem.vue?vue&type=style&index=0&lang.css">',
    ].join('')

    expect(dedupeDevTuffexStylesheets(html, '/')).toBe([
      '<link rel="stylesheet" href="/_nuxt/components/tuff/TuffHome.vue?vue&type=style&index=0&lang.css">',
      '<link rel="stylesheet" href="/_nuxt/components/tuff/landing/TuffLandingNexusHero.vue?vue&type=style&index=0&lang.css">',
    ].join(''))
  })
})
