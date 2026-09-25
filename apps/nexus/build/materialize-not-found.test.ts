import { Buffer } from 'node:buffer'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertRenderedNotFoundPage, materializeNotFoundPage, NOT_FOUND_MARKER, notFoundSourcePath } from './materialize-not-found.mjs'
import { NOT_FOUND_PRERENDER_ROUTE } from './nexus-static-routes.mjs'

const rendered = `<!DOCTYPE html><html><head><title>Page not found · Tuff Nexus</title></head><body><div id="__nuxt"><main><div role="img" ${NOT_FOUND_MARKER}>4 4</div><h1>Page not found</h1></main></div></body></html>`
const emptyShell = '<!DOCTYPE html><html><head></head><body><div id="__nuxt"></div><div id="teleports"></div></body></html>'

function createDist(files: Record<string, string>) {
  const distRoot = mkdtempSync(join(tmpdir(), 'nexus-not-found-'))
  for (const [file, content] of Object.entries(files))
    writeFileSync(join(distRoot, file), content)
  return distRoot
}

describe('materialize not-found page', () => {
  it('reads the prerendered private route as <route>.html', () => {
    expect(NOT_FOUND_PRERENDER_ROUTE).toBe('/__not-found')
    expect(notFoundSourcePath('/dist')).toBe('/dist/__not-found.html')
  })

  it('copies the rendered page to 404.html and removes the private route file', () => {
    const distRoot = createDist({ '__not-found.html': rendered })
    expect(materializeNotFoundPage(distRoot)).toEqual({ bytes: Buffer.byteLength(rendered), reused: false })
    expect(readFileSync(join(distRoot, '404.html'), 'utf8')).toBe(rendered)
    expect(existsSync(join(distRoot, '__not-found.html'))).toBe(false)
  })

  it('is re-runnable: with the source already consumed it verifies the existing 404.html', () => {
    const distRoot = createDist({ '__not-found.html': rendered })
    materializeNotFoundPage(distRoot)
    expect(materializeNotFoundPage(distRoot)).toEqual({ bytes: Buffer.byteLength(rendered), reused: true })
    expect(readFileSync(join(distRoot, '404.html'), 'utf8')).toBe(rendered)

    // …but an existing 404.html that is a shell is still refused, not silently accepted.
    writeFileSync(join(distRoot, '404.html'), emptyShell)
    expect(() => materializeNotFoundPage(distRoot)).toThrow(/empty shell/)
  })

  it('refuses an empty no-SSR shell instead of shipping a blank not-found page', () => {
    // What a literal `/404.html` prerender produced: Nuxt treats that file name as the
    // single-page fallback and renders nothing into `#__nuxt`.
    expect(() => assertRenderedNotFoundPage(emptyShell)).toThrow(/empty shell/)
    const distRoot = createDist({ '__not-found.html': emptyShell })
    expect(() => materializeNotFoundPage(distRoot)).toThrow(/empty shell/)
    expect(existsSync(join(distRoot, '404.html'))).toBe(false)
  })

  it('refuses a page without the not-found hero, and a missing source', () => {
    expect(() => assertRenderedNotFoundPage('<div id="__nuxt"><p>hello</p></div>')).toThrow(/does not contain/)
    expect(() => materializeNotFoundPage(createDist({}))).toThrow(/is missing/)
  })
})
