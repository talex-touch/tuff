import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLOUDFLARE_HEADERS_MAX_LINE_LENGTH } from './nexus-static-routes.mjs'
import {
  EARLY_HINTS_MARKER,
  extractEarlyHintTargets,
  formatLinkHeader,
  intersectEarlyHintTargets,
  mergeEarlyHintBlocks,
  renderEarlyHintBlocks,
  writeEarlyHints,
} from './write-early-hints.mjs'

function page(entry: string, styles: string[], extra = '') {
  const links = styles.map(href => `<link rel="stylesheet" href="${href}" crossorigin>`).join('')
  return `<!DOCTYPE html><html><head>${links}<link rel="modulepreload" href="/_nuxt/other.js">${extra}</head><body><script type="module" src="${entry}" crossorigin></script></body></html>`
}

function createDist(files: Record<string, string>) {
  const distRoot = mkdtempSync(join(tmpdir(), 'nexus-early-hints-'))
  for (const [file, content] of Object.entries(files)) {
    const path = join(distRoot, file)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, content)
  }
  return distRoot
}

const nitroHeaders = [
  '/en/docs/*',
  '  cache-control: public, max-age=300, s-maxage=3600',
  '/_nuxt/*',
  '  cache-control: public, max-age=31536000, immutable',
  '',
].join('\n')

describe('early hints', () => {
  it('reads the entry script and stylesheets out of prerendered HTML', () => {
    const html = page('/_nuxt/Cabc.js', ['/_nuxt/entry.D1.css', '/_nuxt/docs.D2.css'])
    expect(extractEarlyHintTargets(html)).toEqual({
      entry: '/_nuxt/Cabc.js',
      styles: ['/_nuxt/entry.D1.css', '/_nuxt/docs.D2.css'],
    })
  })

  it('keeps only the assets every sample page shares', () => {
    const shared = intersectEarlyHintTargets([
      { entry: '/_nuxt/e.js', styles: ['/_nuxt/entry.css', '/_nuxt/docs.css', '/_nuxt/Button.css'] },
      { entry: '/_nuxt/e.js', styles: ['/_nuxt/entry.css', '/_nuxt/docs.css'] },
    ])
    expect(shared).toEqual({ entry: '/_nuxt/e.js', styles: ['/_nuxt/entry.css', '/_nuxt/docs.css'] })
    expect(intersectEarlyHintTargets([
      { entry: '/_nuxt/e.js', styles: [] },
      { entry: '/_nuxt/f.js', styles: [] },
    ])).toEqual({ entry: null, styles: [] })
  })

  it('formats a Link header with the crossorigin every Nuxt tag carries', () => {
    expect(formatLinkHeader({ entry: '/_nuxt/e.js', styles: ['/_nuxt/entry.css'] }))
      .toBe('</_nuxt/e.js>; rel=modulepreload; crossorigin, </_nuxt/entry.css>; rel=preload; as=style; crossorigin')
    expect(formatLinkHeader({ entry: null, styles: [] })).toBe('')
  })

  it('stops adding stylesheets before the line would cross the _headers limit', () => {
    const styles = Array.from({ length: 60 }, (_, index) => `/_nuxt/Component${index}.${'a'.repeat(8)}.css`)
    const value = formatLinkHeader({ entry: '/_nuxt/e.js', styles })
    expect(`Link: ${value}`.length).toBeLessThanOrEqual(CLOUDFLARE_HEADERS_MAX_LINE_LENGTH)
    expect(value.startsWith('</_nuxt/e.js>; rel=modulepreload; crossorigin, </_nuxt/Component0.')).toBe(true)
    expect(value).not.toContain('Component59.')
    // The cap falls on an entry boundary, never inside one.
    expect(value.endsWith('; crossorigin')).toBe(true)
  })

  it('merges Link into the block nitro wrote for the same pattern and appends the rest under a marker', () => {
    const blocks = [
      { pattern: '/', link: '</_nuxt/e.js>; rel=modulepreload; crossorigin' },
      { pattern: '/en/docs/*', link: '</_nuxt/docs.css>; rel=preload; as=style; crossorigin' },
    ]
    const merged = mergeEarlyHintBlocks(nitroHeaders, blocks)
    expect(merged).toBe([
      '/en/docs/*',
      '  cache-control: public, max-age=300, s-maxage=3600',
      '  Link: </_nuxt/docs.css>; rel=preload; as=style; crossorigin',
      '/_nuxt/*',
      '  cache-control: public, max-age=31536000, immutable',
      '',
      EARLY_HINTS_MARKER,
      '/',
      '  Link: </_nuxt/e.js>; rel=modulepreload; crossorigin',
      '',
    ].join('\n'))
    // A second pass starts from its own output and lands on the same text.
    expect(mergeEarlyHintBlocks(merged, blocks)).toBe(merged)
    // A stale Link line from an earlier build is replaced, not kept beside the new one.
    const stale = nitroHeaders.replace('s-maxage=3600\n', 's-maxage=3600\n  Link: </_nuxt/old.css>; rel=preload; as=style; crossorigin\n')
    expect(mergeEarlyHintBlocks(stale, blocks)).toBe(merged)
    expect(mergeEarlyHintBlocks('', blocks).startsWith(`${EARLY_HINTS_MARKER}\n/\n`)).toBe(true)
  })

  it('writes one block per pattern into dist/_headers', () => {
    const distRoot = createDist({
      '_headers': nitroHeaders,
      'index.html': page('/_nuxt/e.js', ['/_nuxt/entry.css', '/_nuxt/TheHeader.css']),
      'pricing.html': page('/_nuxt/e.js', ['/_nuxt/entry.css']),
      'en/docs.html': page('/_nuxt/e.js', ['/_nuxt/entry.css', '/_nuxt/docs.css']),
      'en/docs/dev/components/button.html': page('/_nuxt/e.js', ['/_nuxt/entry.css', '/_nuxt/docs.css', '/_nuxt/TxButton.css']),
      'en/docs/guide/start.html': page('/_nuxt/e.js', ['/_nuxt/entry.css', '/_nuxt/docs.css']),
    })

    const blocks = writeEarlyHints(distRoot)
    const patterns = blocks.map(block => block.pattern)
    expect(patterns).toContain('/')
    expect(patterns).toContain('/pricing')
    expect(patterns).toContain('/en/docs/*')
    // No zh sample exists in this fixture, so no block is written for it.
    expect(patterns).not.toContain('/zh/docs/*')

    const headers = readFileSync(join(distRoot, '_headers'), 'utf8')
    expect(headers.match(/^\/en\/docs\/\*$/gm)).toHaveLength(1)
    expect(headers).toContain([
      '/en/docs/*',
      '  cache-control: public, max-age=300, s-maxage=3600',
      '  Link: </_nuxt/e.js>; rel=modulepreload; crossorigin, </_nuxt/entry.css>; rel=preload; as=style; crossorigin, </_nuxt/docs.css>; rel=preload; as=style; crossorigin',
      '/_nuxt/*',
    ].join('\n'))
    expect(headers).toContain(`${EARLY_HINTS_MARKER}\n`)
    expect(headers).not.toContain('TxButton.css')
    for (const line of headers.split('\n'))
      expect(line.trim().length).toBeLessThanOrEqual(CLOUDFLARE_HEADERS_MAX_LINE_LENGTH)

    // Running again rewrites the same file instead of stacking a second copy.
    writeEarlyHints(distRoot)
    const rerun = readFileSync(join(distRoot, '_headers'), 'utf8')
    expect(rerun.split(EARLY_HINTS_MARKER).length).toBe(2)
    expect(rerun).toBe(headers)
  })

  it('renders nothing for a family whose samples are missing and fails when no HTML exists at all', () => {
    const distRoot = createDist({ '_headers': '' })
    expect(renderEarlyHintBlocks(distRoot)).toEqual([])
    expect(() => writeEarlyHints(distRoot)).toThrow('[nexus-early-hints] no prerendered HTML found')
  })
})
