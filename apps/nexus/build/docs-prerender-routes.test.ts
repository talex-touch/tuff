import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDocsPrerenderRoutes, normalizeDocsContentRoute } from './docs-prerender-routes'
import { createNexusPrerenderRoutes, docsApiPrerenderRoutes, publicPrerenderRoutes } from './nexus-prerender-routes'

describe('docs prerender routes', () => {
  it('normalizes locale and markdown suffixes to canonical docs routes', () => {
    expect(normalizeDocsContentRoute('guide/start.en.md')).toEqual(['/docs/guide/start'])
    expect(normalizeDocsContentRoute('hello.zh.mdc')).toEqual(['/docs/hello'])
  })

  it('keeps long-tail developer docs on runtime SSR', () => {
    expect(normalizeDocsContentRoute('dev/api/box.zh.mdc')).toEqual([])
    expect(normalizeDocsContentRoute('dev/components/button.en.mdc')).toEqual([])
  })

  it('adds directory routes for index documents', () => {
    expect(normalizeDocsContentRoute('dev/index.zh.mdc')).toEqual([
      '/docs/dev/index',
      '/docs/dev',
    ])
    expect(normalizeDocsContentRoute('index.en.mdc')).toEqual(['/docs/index', '/docs'])
  })

  it('deduplicates locale variants when scanning content files', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-docs-routes-'))
    const docsDir = join(root, 'content/docs/guide')
    mkdirSync(docsDir, { recursive: true })
    writeFileSync(join(docsDir, 'start.zh.mdc'), '# Start')
    writeFileSync(join(docsDir, 'start.en.mdc'), '# Start')
    writeFileSync(join(docsDir, 'index.zh.md'), '# Components')
    writeFileSync(join(docsDir, 'automation.zh.md'), '# Runtime only')

    expect(createDocsPrerenderRoutes(root)).toEqual([
      '/docs/guide',
      '/docs/guide/index',
      '/docs/guide/start',
    ])
  })

  it('combines public pages, docs APIs, and scanned docs into Nexus prerender routes', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-prerender-routes-'))
    const docsDir = join(root, 'content/docs/guide')
    mkdirSync(docsDir, { recursive: true })
    writeFileSync(join(docsDir, 'start.zh.mdc'), '# Start')

    const routes = createNexusPrerenderRoutes(root)

    expect(routes).toEqual(expect.arrayContaining([
      ...publicPrerenderRoutes,
      ...docsApiPrerenderRoutes,
      '/docs/guide/start',
    ]))
    expect(routes.filter(route => route === '/docs')).toHaveLength(1)
    expect(routes).not.toEqual(expect.arrayContaining([
      '/docs/dev/components/button',
      '/dashboard',
    ]))
  })
})
