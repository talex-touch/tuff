import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDocsPrerenderRoutes, normalizeDocsContentRoute } from './docs-prerender-routes'
import { createNexusPrerenderRoutes, docsApiPrerenderRoutes, publicPrerenderRoutes } from './nexus-prerender-routes'

describe('docs prerender routes', () => {
  it('normalizes locale and markdown suffixes to canonical docs routes', () => {
    expect(normalizeDocsContentRoute('guide/start.en.md')).toEqual([
      '/en/docs/guide/start',
      '/zh/docs/guide/start',
    ])
    expect(normalizeDocsContentRoute('hello.zh.mdc')).toEqual([
      '/en/docs/hello',
      '/zh/docs/hello',
    ])
  })

  it('includes long-tail developer docs in static prerender routes', () => {
    expect(normalizeDocsContentRoute('dev/api/box.zh.mdc')).toEqual([
      '/en/docs/dev/api/box',
      '/zh/docs/dev/api/box',
    ])
    expect(normalizeDocsContentRoute('dev/components/button.en.mdc')).toEqual([
      '/en/docs/dev/components/button',
      '/zh/docs/dev/components/button',
    ])
  })

  it('adds directory routes for index documents', () => {
    expect(normalizeDocsContentRoute('dev/index.zh.mdc')).toEqual([
      '/en/docs/dev/index',
      '/zh/docs/dev/index',
      '/en/docs/dev',
      '/zh/docs/dev',
    ])
    expect(normalizeDocsContentRoute('index.en.mdc')).toEqual([
      '/en/docs/index',
      '/zh/docs/index',
      '/en/docs',
      '/zh/docs',
    ])
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
      '/en/docs/guide',
      '/en/docs/guide/automation',
      '/en/docs/guide/index',
      '/en/docs/guide/start',
      '/zh/docs/guide',
      '/zh/docs/guide/automation',
      '/zh/docs/guide/index',
      '/zh/docs/guide/start',
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
      '/en/docs/guide/start',
      '/zh/docs/guide/start',
    ]))
    expect(routes).not.toEqual(expect.arrayContaining([
      '/docs',
      '/docs/guide/start',
      '/dashboard',
    ]))
  })
})
