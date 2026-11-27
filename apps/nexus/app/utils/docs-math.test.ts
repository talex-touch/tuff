import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import { describe, expect, it } from 'vitest'
import { hasDocMathContent } from './docs-math'
import { buildDocsMetaState, slimDocsPagePayload } from './docs-page-payload'
import { remarkMath } from './remark-math'

const nexusRoot = join(import.meta.dirname, '../..')

describe('conditional KaTeX detection', () => {
  it('detects KaTeX markup across minimark, HAST/MDC trees, and raw HTML strings', () => {
    expect(hasDocMathContent({
      type: 'minimark',
      value: [
        ['p', {}, 'Energy formula ', ['span', { className: ['katex'] }, 'E = mc^2']],
      ],
    })).toBe(true)

    expect(hasDocMathContent({
      type: 'root',
      children: [
        { type: 'element', tag: 'div', props: { class: 'katex-display' }, children: [] },
      ],
    })).toBe(true)

    expect(hasDocMathContent('<span class="katex">x</span>')).toBe(true)
    expect(hasDocMathContent({ type: 'minimark', value: [['p', {}, 'Plain paragraph']] })).toBe(false)
    expect(hasDocMathContent(null)).toBe(false)
  })

  it('detects real markdown parsed with remarkMath and ignores non-math docs', async () => {
    const mathParsed = await parseMarkdown('# Formula\n\n$$\nE = mc^2\n$$\n', {
      highlight: false,
      remark: { plugins: { 'remark-math': { instance: remarkMath } } },
    })
    expect(hasDocMathContent(mathParsed.body)).toBe(true)

    const guideSource = readFileSync(join(nexusRoot, 'content/docs/guide/start.en.mdc'), 'utf8')
    const guideParsed = await parseMarkdown(guideSource, {
      highlight: false,
      remark: { plugins: { 'remark-math': { instance: remarkMath } } },
    })
    expect(hasDocMathContent(guideParsed.body)).toBe(false)
  })

  it('removes unconditional static katex.min.css import from docs/[...slug].vue', () => {
    const docsPageSource = readFileSync(join(nexusRoot, 'app/pages/docs/[...slug].vue'), 'utf8')
    expect(docsPageSource).not.toMatch(/import\s+['"]katex\/dist\/katex\.min\.css['"]/)
    expect(docsPageSource).toContain('DocsKatexStyles.vue')
    expect(docsPageSource).toContain('<LazyDocsKatexStyles v-if="hasMathContent"')
  })
})

describe('docs __NUXT_DATA__ payload trimming', () => {
  it('strips redundant content fields while preserving body, seo, meta, and timestamps', () => {
    const body = { type: 'minimark', value: [['h1', {}, 'Button']], toc: { links: [{ id: 'usage', depth: 2, text: 'Usage' }] } }
    const input = {
      id: 'docs/dev/components/button.en.mdc',
      path: '/docs/dev/components/button.en',
      title: 'Button',
      description: 'Interactive button',
      rawbody: '# Button\n\nLots of duplicated markdown source...',
      stem: 'docs/dev/components/button.en',
      extension: 'mdc',
      navigation: true,
      __hash__: 'abc123',
      toc: body.toc,
      body,
      seo: { title: 'Button' },
      meta: {
        title: 'Button',
        category: 'Basic',
        since: '2.0.0',
        syncStatus: 'verified',
        verified: true,
        updatedAt: '2026-10-01T00:00:00.000Z',
        rawbody: 'should drop',
        body: 'should drop',
      },
    }

    const result = slimDocsPagePayload(input)
    expect(result.body).toEqual(body)
    expect(result.path).toBe('/docs/dev/components/button.en')
    expect(result.title).toBe('Button')
    expect(result.seo).toEqual({ title: 'Button' })
    expect(result.meta).toEqual({
      category: 'Basic',
      since: '2.0.0',
      syncStatus: 'verified',
      verified: true,
      updatedAt: '2026-10-01T00:00:00.000Z',
    })
    expect('rawbody' in result).toBe(false)
    expect('stem' in result).toBe(false)
    expect('extension' in result).toBe(false)
    expect('navigation' in result).toBe(false)
    expect('__hash__' in result).toBe(false)
    expect('toc' in result).toBe(false)
  })

  it('never leaks document body or rawbody into useState("docs-meta")', () => {
    const state = buildDocsMetaState({
      path: '/docs/dev/components/button.en',
      verified: true,
      syncStatus: 'migrated',
      body: { type: 'minimark', value: [['p', {}, 'huge AST']] },
      rawbody: 'huge markdown',
      description: 'extra',
    })

    expect(state).toEqual({
      path: '/docs/dev/components/button.en',
      verified: true,
      syncStatus: 'migrated',
    })
    expect('body' in state).toBe(false)
    expect('rawbody' in state).toBe(false)
  })
})
