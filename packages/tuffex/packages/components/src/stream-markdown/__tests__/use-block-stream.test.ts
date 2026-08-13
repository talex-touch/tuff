import { Marked } from 'marked'
import { describe, expect, it, vi } from 'vitest'
import { createBlockStream } from '../src/use-block-stream'

function makeStream(sanitize?: (html: string) => string) {
  const marked = new Marked({ gfm: true, breaks: true })
  return createBlockStream({ marked, sanitize })
}

describe('createBlockStream', () => {
  it('returns no blocks for empty content', () => {
    const stream = makeStream()
    expect(stream.update('')).toEqual([])
  })

  it('keeps the tail id stable while a paragraph grows', () => {
    const stream = makeStream()
    const first = stream.update('Hello')
    const second = stream.update('Hello world')

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(second[0]!.id).toBe(first[0]!.id)
    expect(second[0]!.html).toContain('Hello world')
  })

  it('reuses settled block objects and only assigns fresh ids to new blocks', () => {
    const stream = makeStream()
    stream.update('First paragraph')
    const settled = stream.update('First paragraph\n\nSecond grows')
    const grown = stream.update('First paragraph\n\nSecond grows longer')

    // The settled block is carried over by reference — no re-parse, no re-render.
    expect(grown[0]).toBe(settled[0])
    // The tail keeps its id while growing.
    expect(grown[1]!.id).toBe(settled[1]!.id)

    const split = stream.update('First paragraph\n\nSecond grows longer\n\nThird')
    expect(split[2]!.id).not.toBe(split[1]!.id)
    expect(split[0]).toBe(settled[0])
  })

  it('does not re-sanitize stable blocks', () => {
    const sanitize = vi.fn((html: string) => html)
    const stream = makeStream(sanitize)

    stream.update('Stable paragraph\n\nTail')
    const callsAfterFirst = sanitize.mock.calls.length
    stream.update('Stable paragraph\n\nTail grows')

    // Only the changed tail went through the sanitizer again.
    expect(sanitize.mock.calls.length).toBe(callsAfterFirst + 1)
    expect(sanitize.mock.calls.at(-1)?.[0]).toContain('Tail grows')
  })

  it('lets a setext rewrite turn the tail paragraph into a heading without a new id', () => {
    const stream = makeStream()
    const before = stream.update('Title')
    const after = stream.update('Title\n===')

    expect(before[0]!.html).toContain('<p>')
    expect(after).toHaveLength(1)
    expect(after[0]!.html).toContain('<h1')
    expect(after[0]!.id).toBe(before[0]!.id)
  })

  it('re-renders earlier stable blocks when a reference link definition arrives late', () => {
    const stream = makeStream()
    const before = stream.update('See [docs] for details.\n\nMore text.')
    expect(before[0]!.html).not.toContain('<a')

    const after = stream.update('See [docs] for details.\n\nMore text.\n\n[docs]: https://example.com')
    expect(after[0]!.html).toContain('href="https://example.com"')
    // Identity is preserved even though the output changed.
    expect(after[0]!.id).toBe(before[0]!.id)
  })

  it('tracks fence language and closure across deltas', () => {
    const stream = makeStream()
    const open = stream.update('```ts {1,2}\nconst a = 1')
    expect(open).toHaveLength(1)
    expect(open[0]!.type).toBe('code')
    expect(open[0]!.lang).toBe('ts')
    expect(open[0]!.code).toContain('const a = 1')
    expect(open[0]!.fenceClosed).toBe(false)

    const closed = stream.update('```ts {1,2}\nconst a = 1\n```')
    expect(closed[0]!.fenceClosed).toBe(true)
    expect(closed[0]!.id).toBe(open[0]!.id)
  })

  it('treats tilde fences and longer closing runs as closed', () => {
    const stream = makeStream()
    const blocks = stream.update('~~~mermaid\ngraph TD\n~~~~')
    expect(blocks[0]!.type).toBe('code')
    expect(blocks[0]!.lang).toBe('mermaid')
    expect(blocks[0]!.fenceClosed).toBe(true)
  })

  it('does not report a bare opening fence as closed', () => {
    const stream = makeStream()
    const blocks = stream.update('```')
    expect(blocks[0]!.type).toBe('code')
    expect(blocks[0]!.lang).toBe('')
    expect(blocks[0]!.fenceClosed).toBe(false)
  })

  it('reports indented code as an unclosed code block with no language', () => {
    const stream = makeStream()
    const blocks = stream.update('Intro:\n\n    indented code')
    expect(blocks).toHaveLength(2)
    expect(blocks[1]!.type).toBe('code')
    expect(blocks[1]!.lang).toBe('')
    expect(blocks[1]!.fenceClosed).toBe(false)
  })

  it('never emits blank-line tokens as blocks', () => {
    const stream = makeStream()
    const blocks = stream.update('One\n\n\n\nTwo')
    expect(blocks).toHaveLength(2)
    expect(blocks.every(block => block.raw.trim().length > 0)).toBe(true)
  })

  it('applies the sanitizer to markup blocks', () => {
    const stream = makeStream(html => html.replace(/<script[\s\S]*?<\/script>/gi, ''))
    const blocks = stream.update('Safe text\n\n<script>alert(1)</script>')
    expect(blocks.map(block => block.html).join('')).not.toContain('<script>')
  })

  it('drops trailing entries when content shrinks', () => {
    const stream = makeStream()
    stream.update('One\n\nTwo\n\nThree')
    const shrunk = stream.update('One')
    expect(shrunk).toHaveLength(1)
    expect(shrunk[0]!.html).toContain('One')
  })

  it('recomputes everything after reset', () => {
    const sanitize = vi.fn((html: string) => html)
    const stream = makeStream(sanitize)
    stream.update('Same content')
    const before = sanitize.mock.calls.length

    stream.reset()
    stream.update('Same content')
    expect(sanitize.mock.calls.length).toBeGreaterThan(before)
  })
})
