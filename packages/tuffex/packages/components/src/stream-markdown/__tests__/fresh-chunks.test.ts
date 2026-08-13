// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createFreshChunks } from '../src/use-fresh-chunks'

/**
 * The contract under test: chunks are keyed by character offset and survive
 * wholesale innerHTML replacement — every update re-wraps what is still
 * animating with a negative delay, and never re-animates settled text.
 */

function harness(durationMs = 400) {
  let clock = 0
  const fresh = createFreshChunks({ durationMs, now: () => clock })
  const el = document.createElement('div')
  return {
    el,
    fresh,
    advance(ms: number) {
      clock += ms
    },
    /** Simulates the v-html patch: wholesale replacement, wrappers destroyed. */
    patch(html: string) {
      el.innerHTML = html
    },
    spans() {
      return Array.from(el.querySelectorAll('.tx-stream-md__fresh'))
    },
  }
}

describe('createFreshChunks', () => {
  it('wraps a brand-new block wholly, with zero delay', () => {
    const { el, fresh, patch, spans } = harness()
    patch('<p>老板你好</p>')
    fresh.update(el, 1)

    expect(spans()).toHaveLength(1)
    expect(spans()[0]!.textContent).toBe('老板你好')
    expect((spans()[0] as HTMLElement).style.animationDelay).toBe('0.0ms')
    expect(el.textContent).toBe('老板你好')
  })

  it('wraps only the appended delta on growth', () => {
    const { el, fresh, patch, spans, advance } = harness()
    patch('<p>第一段。</p>')
    fresh.update(el, 1)

    advance(500) // first chunk ages out
    patch('<p>第一段。第二段来了</p>')
    fresh.update(el, 1)

    expect(spans()).toHaveLength(1)
    expect(spans()[0]!.textContent).toBe('第二段来了')
    // The settled prefix stays unwrapped.
    expect(el.querySelector('p')!.firstChild!.textContent).toBe('第一段。')
  })

  it('resumes interrupted animations with a negative delay after a re-patch', () => {
    const { el, fresh, patch, spans, advance } = harness()
    patch('<p>先来的</p>')
    fresh.update(el, 1)

    advance(150)
    patch('<p>先来的后到的</p>')
    fresh.update(el, 1)

    const delays = spans().map(span => (span as HTMLElement).style.animationDelay)
    expect(delays).toContain('-150.0ms') // the older chunk, mid-flight
    expect(delays).toContain('0.0ms') // the fresh one
    expect(el.textContent).toBe('先来的后到的')
  })

  it('spans inline element boundaries without breaking structure', () => {
    const { el, fresh, patch, spans, advance } = harness()
    patch('<p>说</p>')
    fresh.update(el, 1)
    advance(500)

    // The delta lands partly in plain text, partly inside <strong>.
    patch('<p>说到<strong>重点</strong></p>')
    fresh.update(el, 1)

    const wrapped = spans()
    expect(wrapped.map(span => span.textContent).join('')).toBe('到重点')
    expect(el.querySelector('strong')).not.toBeNull()
    expect(el.textContent).toBe('说到重点')
  })

  it('skips one beat instead of replaying when the parse rewrites earlier text', () => {
    const { el, fresh, patch, spans, advance } = harness()
    patch('<p>看这里 *强调</p>')
    fresh.update(el, 1)
    advance(500)

    // The closing `*` arrives: marked rewrites the earlier output entirely.
    patch('<p>看这里 <em>强调</em>了</p>')
    fresh.update(el, 1)
    expect(spans()).toHaveLength(0)

    // The next append animates again, from the resynced offsets.
    patch('<p>看这里 <em>强调</em>了，继续</p>')
    fresh.update(el, 1)
    expect(spans()).toHaveLength(1)
    expect(spans()[0]!.textContent).toBe('，继续')
  })

  it('starts a new registry when the tail becomes a different block', () => {
    const { el, fresh, patch, spans, advance } = harness()
    patch('<p>块一</p>')
    fresh.update(el, 1)
    advance(500)

    patch('<p>块二整个都是新的</p>')
    fresh.update(el, 2)
    expect(spans()).toHaveLength(1)
    expect(spans()[0]!.textContent).toBe('块二整个都是新的')
  })

  it('finish unwraps everything and normalizes the text back together', () => {
    const { el, fresh, patch, spans } = harness()
    patch('<p>甲</p>')
    fresh.update(el, 1)
    patch('<p>甲乙</p>')
    fresh.update(el, 1)
    expect(spans().length).toBeGreaterThan(0)

    fresh.finish(el)
    expect(spans()).toHaveLength(0)
    expect(el.textContent).toBe('甲乙')
    // normalize() merged the split text nodes back into one.
    expect(el.querySelector('p')!.childNodes).toHaveLength(1)
  })
})
