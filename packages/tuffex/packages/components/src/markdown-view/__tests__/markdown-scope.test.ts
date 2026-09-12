// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const componentsRoot = resolve(here, '../..')

const css = readFileSync(resolve(componentsRoot, 'markdown-view/src/github-markdown.css'), 'utf8')
const markdownView = readFileSync(resolve(componentsRoot, 'markdown-view/src/TxMarkdownView.vue'), 'utf8')
const streamMarkdown = readFileSync(resolve(componentsRoot, 'stream-markdown/src/TxStreamMarkdown.vue'), 'utf8')

/**
 * This sheet is vendored from github-markdown-css and imported as a *global*
 * stylesheet by both `markdown-view/index.ts` and `stream-markdown/index.ts`.
 * `.markdown-body` is generic enough that any host may already use it — the
 * Nexus docs body does — so importing either component used to restyle the
 * whole page.
 *
 * The scope is `:where(.tx-md)`, a marker class both roots carry. Naming both
 * roots in the scope instead cost 24 bytes on every one of 314 selectors, which
 * on its own put `stream-markdown/style.css` over its size budget.
 */
describe('vendored markdown stylesheet scope', () => {
  /** Every rule prelude in the sheet, at-rules excluded, comments stripped. */
  function selectors(source: string): string[] {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '')
    const out: string[] = []
    let prelude = ''

    for (const char of code) {
      if (char === '{') {
        const text = prelude.trim()
        if (text && !text.startsWith('@'))
          out.push(text)
        prelude = ''
      }
      else if (char === '}') {
        prelude = ''
      }
      else {
        prelude += char
      }
    }

    // Split selector lists, but not the commas inside `:where(a, b)`.
    return out.flatMap((list) => {
      const parts: string[] = []
      let depth = 0
      let current = ''
      for (const char of list) {
        if (char === '(')
          depth++
        else if (char === ')')
          depth--
        if (char === ',' && depth === 0) {
          parts.push(current)
          current = ''
        }
        else {
          current += char
        }
      }
      parts.push(current)
      return parts.map(part => part.trim()).filter(Boolean)
    })
  }

  const rules = selectors(css)

  it('has rules to check', () => {
    expect(rules.length).toBeGreaterThan(300)
  })

  it('never lets a rule match .markdown-body without a component ancestor', () => {
    // A handful of theme selectors name `.tx-markdown-view` directly — that
    // component puts its own `theme` prop on its root, so those are scoped by
    // construction. Everything else goes through the marker.
    const unscoped = rules.filter(rule =>
      !rule.includes(':where(.tx-md)')
      && !rule.includes('.tx-markdown-view')
      && !rule.includes('.tx-stream-md'),
    )

    expect(unscoped, 'an unscoped .markdown-body rule leaks onto every host page').toEqual([])
  })

  it('carries the bulk of the sheet on the short marker', () => {
    const marked = rules.filter(rule => rule.includes(':where(.tx-md)'))

    expect(marked.length / rules.length).toBeGreaterThan(0.95)
  })

  it('uses the short marker, not the two root class names', () => {
    // Cheap to let this drift back during a re-vendor; expensive in bundle size.
    expect(css.slice(css.indexOf('*/'))).not.toContain('.tx-markdown-view, .tx-stream-md')
  })

  it('puts the marker on both roots that render .markdown-body', () => {
    expect(markdownView).toContain('class="tx-md tx-markdown-view"')
    expect(streamMarkdown).toContain('class="tx-md tx-stream-md"')
  })
})
