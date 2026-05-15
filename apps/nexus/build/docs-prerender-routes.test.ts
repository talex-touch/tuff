import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDocsPrerenderRoutes, normalizeDocsContentRoute } from './docs-prerender-routes'

describe('docs prerender routes', () => {
  it('normalizes locale and markdown suffixes to canonical docs routes', () => {
    expect(normalizeDocsContentRoute('dev/api/box.zh.mdc')).toEqual(['/docs/dev/api/box'])
    expect(normalizeDocsContentRoute('guide/start.en.md')).toEqual(['/docs/guide/start'])
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
    const docsDir = join(root, 'content/docs/dev/components')
    mkdirSync(docsDir, { recursive: true })
    writeFileSync(join(docsDir, 'button.zh.mdc'), '# Button')
    writeFileSync(join(docsDir, 'button.en.mdc'), '# Button')
    writeFileSync(join(docsDir, 'index.zh.md'), '# Components')

    expect(createDocsPrerenderRoutes(root)).toEqual([
      '/docs/dev/components',
      '/docs/dev/components/button',
      '/docs/dev/components/index',
    ])
  })
})
