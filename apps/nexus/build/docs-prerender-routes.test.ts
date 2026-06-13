import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createDocsPrerenderRoutes, normalizeDocsContentRoute } from './docs-prerender-routes'
import { createNexusPrerenderEvidence, createNexusPrerenderRoutes, docsApiPrerenderRoutes, publicPrerenderRoutes } from './nexus-prerender-routes'

const nexusRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

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

  it('reports prerender evidence for localized docs navigation and stable docs APIs', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-prerender-evidence-'))
    const docsDir = join(root, 'content/docs')
    mkdirSync(join(docsDir, 'dev/getting-started'), { recursive: true })
    mkdirSync(join(docsDir, 'dev/components'), { recursive: true })
    mkdirSync(join(docsDir, 'guide'), { recursive: true })
    writeFileSync(join(docsDir, 'index.en.mdc'), '# Docs')
    writeFileSync(join(docsDir, 'dev/index.en.mdc'), '# Developer Hub')
    writeFileSync(join(docsDir, 'dev/getting-started/quickstart.en.mdc'), '# Quickstart')
    writeFileSync(join(docsDir, 'dev/components/index.zh.mdc'), '# Components')
    writeFileSync(join(docsDir, 'guide/start.zh.mdc'), '# Start')

    const evidence = createNexusPrerenderEvidence(root)

    expect(evidence.docsApiRoutes).toEqual([...docsApiPrerenderRoutes])
    expect(evidence.missingRequiredDocsRoutes).toEqual([])
    expect(evidence.requiredDocsRoutes).toEqual(expect.arrayContaining([
      '/en/docs',
      '/zh/docs',
      '/en/docs/dev',
      '/zh/docs/dev',
      '/en/docs/dev/getting-started/quickstart',
      '/zh/docs/dev/getting-started/quickstart',
      '/en/docs/dev/components',
      '/zh/docs/dev/components',
      '/en/docs/guide/start',
      '/zh/docs/guide/start',
    ]))
    expect(evidence.docsRouteCount).toBeGreaterThanOrEqual(evidence.requiredDocsRoutes.length)
    expect(evidence.routeCount).toBeGreaterThan(evidence.docsRouteCount)
    expect(evidence.staticWorkerRoutes).toEqual(expect.arrayContaining([
      ...publicPrerenderRoutes,
      ...docsApiPrerenderRoutes,
      ...evidence.requiredDocsRoutes,
    ]))
  })

  it('keeps the current repository docs prerender evidence complete', () => {
    const evidence = createNexusPrerenderEvidence(nexusRoot)

    expect(evidence.missingRequiredDocsRoutes).toEqual([])
    expect(evidence.docsApiRoutes).toEqual([...docsApiPrerenderRoutes])
    expect(evidence.docsRoutes).toEqual(expect.arrayContaining([
      '/en/docs',
      '/zh/docs',
      '/en/docs/dev/getting-started/quickstart',
      '/zh/docs/dev/getting-started/quickstart',
      '/en/docs/dev/components',
      '/zh/docs/dev/components',
      '/en/docs/guide/start',
      '/zh/docs/guide/start',
    ]))
    expect(evidence.docsRoutes).not.toEqual(expect.arrayContaining([
      '/docs',
      '/docs/dev/getting-started/quickstart',
    ]))
  })
})
