import { describe, expect, it } from 'vitest'
import { stripLandingImagePrefetches } from './landingResourceHints'

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

  it('keeps image prefetch hints on non-landing routes', () => {
    expect(stripLandingImagePrefetches(imagePrefetch, '/store')).toBe(imagePrefetch)
  })

  it('keeps image preloads and script modulepreloads on landing routes', () => {
    const html = [imagePreload, modulePreload].join('')

    expect(stripLandingImagePrefetches(html, '/')).toBe(html)
  })
})
