import type { StreamPart } from '../src/types'
import { describe, expect, it } from 'vitest'
import { parseStreamMarkdown } from '../src/parse'

const SOURCES = [
  { id: 'a', url: 'https://example.com/a', title: 'Scoop Data' },
  { id: 'b', url: 'https://example.com/b', title: 'Trends Index' },
]

function types(parts: StreamPart[]): string[] {
  return parts.map(part => part.type)
}

describe('parseStreamMarkdown', () => {
  it('renders the common subset natively', () => {
    const parts = parseStreamMarkdown([
      '## Why it churns',
      '',
      'Sorting is **fast**, *really* ~~slow~~, `code` and [docs](https://example.com).',
      '',
      '1. first',
      '2. second',
      '',
      '> a quote',
      '',
      '---',
      '',
      '```ts',
      'const a = 1',
      '```',
    ].join('\n'))
    expect(types(parts)).toEqual(['heading', 'paragraph', 'list', 'quote', 'rule', 'code'])
    expect(parts[0]).toMatchObject({ type: 'heading', depth: 2, inlines: [{ type: 'text', text: 'Why it churns' }] })
    const inlines = (parts[1] as Extract<StreamPart, { type: 'paragraph' }>).inlines
    expect(inlines).toContainEqual({ type: 'text', text: 'fast', marks: ['strong'] })
    expect(inlines).toContainEqual({ type: 'text', text: 'really', marks: ['em'] })
    expect(inlines).toContainEqual({ type: 'text', text: 'slow', marks: ['del'] })
    expect(inlines).toContainEqual({ type: 'text', text: 'code', marks: ['code'] })
    expect(inlines).toContainEqual({ type: 'text', text: 'docs', href: 'https://example.com' })
    expect(parts[2]).toMatchObject({ type: 'list', ordered: true, start: 1 })
    expect(parts[5]).toEqual({ type: 'code', lang: 'ts', code: 'const a = 1' })
  })

  it('keeps nested and task lists, with tight items as margin-less lines', () => {
    const [list] = parseStreamMarkdown('- [x] done\n- [ ] open\n  - nested')
    expect(list).toMatchObject({ type: 'list', ordered: false })
    const items = (list as Extract<StreamPart, { type: 'list' }>).items
    expect(items[0]).toMatchObject({ checked: true, parts: [{ type: 'paragraph', tight: true }] })
    expect(items[1]!.checked).toBe(false)
    expect(types(items[1]!.parts)).toEqual(['paragraph', 'list'])
  })

  it('hands tables, math, diagrams, HTML and images to TxStreamMarkdown, neighbours together', () => {
    const parts = parseStreamMarkdown([
      'Intro.',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '$$',
      'e = mc^2',
      '$$',
      '',
      'Middle.',
      '',
      '```mermaid',
      'graph TD; A-->B',
      '```',
      '',
      '<div>raw</div>',
      '',
      '![chart](https://example.com/chart.png)',
      '',
      'Inline $x^2$ math.',
    ].join('\n'))
    expect(types(parts)).toEqual(['paragraph', 'markdown', 'paragraph', 'markdown'])
    const [, first, , second] = parts as Extract<StreamPart, { type: 'markdown' }>[]
    expect(first!.raw).toContain('| a | b |')
    expect(first!.raw).toContain('e = mc^2')
    expect(second!.raw).toContain('```mermaid')
    expect(second!.raw).toContain('<div>raw</div>')
    expect(second!.raw).toContain('![chart]')
    expect(second!.raw).toContain('$x^2$')
  })

  it('turns [n] into a chip only in plain text, and only when source n exists', () => {
    const [paragraph] = parseStreamMarkdown('Fast [1], **bold [2]**, `code [1]`, [link [1]](https://x.y) and missing [3].', { sources: SOURCES })
    const inlines = (paragraph as Extract<StreamPart, { type: 'paragraph' }>).inlines
    const chips = inlines.filter(inline => inline.type === 'citation')
    expect(chips).toEqual([
      { type: 'citation', source: SOURCES[0], index: 1 },
      { type: 'citation', source: SOURCES[1], index: 2 },
    ])
    expect(inlines).toContainEqual({ type: 'text', text: 'code [1]', marks: ['code'] })
    expect(inlines.some(inline => inline.type === 'text' && inline.text.includes('missing [3]'))).toBe(true)
    expect(inlines.some(inline => inline.type === 'text' && inline.href === 'https://x.y')).toBe(true)
  })

  it('closes a half-written construct while streaming, and leaves settled text as written', () => {
    const streaming = parseStreamMarkdown('the **important', { streaming: true })
    expect((streaming[0] as Extract<StreamPart, { type: 'paragraph' }>).inlines).toContainEqual({ type: 'text', text: 'important', marks: ['strong'] })
    const settled = parseStreamMarkdown('the **important')
    expect((settled[0] as Extract<StreamPart, { type: 'paragraph' }>).inlines).toEqual([{ type: 'text', text: 'the **important' }])
  })

  it('streams an unclosed fence as a growing code part', () => {
    const parts = parseStreamMarkdown('Look:\n\n```ts\nconst a = 1\nconst b', { streaming: true })
    expect(parts[1]).toEqual({ type: 'code', lang: 'ts', code: 'const a = 1\nconst b' })
  })
})
