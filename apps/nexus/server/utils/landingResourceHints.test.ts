import { describe, expect, it } from 'vitest'
import { stripLandingImagePrefetches, stripStaticModulepreloads } from './landingResourceHints'

describe('stripLandingImagePrefetches', () => {
  const imagePrefetch = '<link rel="prefetch" as="image" type="image/jpeg" href="/_nuxt/calendar.hash.jpg">'
  const reversedImagePrefetch = '<link href="/_nuxt/notion.hash.jpg" as="image" rel="prefetch">'
  const modulePreload = '<link rel="modulepreload" as="script" href="/_nuxt/entry.js">'
  const imagePreload = '<link rel="preload" as="image" href="/hero.jpg">'
  const stylesheet = '<link rel="stylesheet" href="/_nuxt/entry.css">'

  it.each(['/', '/new', '/new/', '/next?source=test'])('removes image prefetch hints from landing route %s', (routePath) => {
    const html = [imagePrefetch, reversedImagePrefetch, modulePreload, imagePreload, stylesheet].join('')

    expect(stripLandingImagePrefetches(html, routePath)).toBe([
      modulePreload,
      imagePreload,
      stylesheet,
    ].join(''))
  })
  it.each(['/docs', '/docs/dev/components/learning-curve', '/zh/docs/dev/components/learning-curve', '/en/docs'])('removes image prefetch hints from docs route %s', (routePath) => {
    const html = [imagePrefetch, reversedImagePrefetch, modulePreload, imagePreload, stylesheet].join('')

    expect(stripLandingImagePrefetches(html, routePath)).toBe([
      modulePreload,
      imagePreload,
      stylesheet,
    ].join(''))
  })


  it('keeps image prefetch hints on non-landing routes', () => {
    expect(stripLandingImagePrefetches(imagePrefetch, '/store')).toBe(imagePrefetch)
  })

  it('keeps image preloads and script modulepreloads on landing routes', () => {
    const html = [imagePreload, modulePreload].join('')

    expect(stripLandingImagePrefetches(html, '/')).toBe(html)
  })
})

describe('stripStaticModulepreloads', () => {
  const entryPreload = '<link rel="modulepreload" as="script" crossorigin href="/_nuxt/entry.abc123.js">'
  const docsLayoutPreload = '<link rel="modulepreload" as="script" crossorigin href="/_nuxt/docs-layout.def456.js">'
  const sentryPreload = '<link rel="modulepreload" as="script" crossorigin href="/_nuxt/sentry.client.xyz.js">'
  const threePreload = '<link rel="modulepreload" as="script" crossorigin href="/_nuxt/vendor-three.xyz.js">'
  const mermaidPreload = '<link rel="modulepreload" as="script" crossorigin href="/_nuxt/mermaid.core.xyz.js">'
  const echartsPreload = '<link rel="modulepreload" as="script" crossorigin href="/_nuxt/echarts.xyz.js">'
  const workboxPreload = '<link rel="modulepreload" as="script" crossorigin href="/_nuxt/workbox-window.xyz.js">'

  it.each(['/', '/en/docs', '/zh/docs/guide/start', '/pricing'])('strips only deferred heavy modulepreloads on static HTML route %s', (routePath) => {
    const html = [
      entryPreload,
      docsLayoutPreload,
      sentryPreload,
      threePreload,
      mermaidPreload,
      echartsPreload,
      workboxPreload,
    ].join('')

    expect(stripStaticModulepreloads(html, routePath)).toBe([entryPreload, docsLayoutPreload].join(''))
  })

  it('leaves non-static dynamic app routes untouched', () => {
    const html = [entryPreload, sentryPreload].join('')
    expect(stripStaticModulepreloads(html, '/dashboard/overview')).toBe(html)
  })
})
