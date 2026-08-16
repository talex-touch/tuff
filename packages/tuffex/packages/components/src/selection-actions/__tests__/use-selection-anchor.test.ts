import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveSelectionPayload } from '../src/use-selection-anchor'

/**
 * jsdom's Selection cannot express a real highlight, so the rules live in a
 * pure resolver and are exercised directly. `getClientRects` is stubbed per
 * range because jsdom reports every rect as zero-sized.
 */
function fakeRange(options: {
  text?: string
  collapsed?: boolean
  container?: Node
  rects?: Array<Partial<DOMRect>>
} = {}): Range {
  const rects = options.rects ?? [{ top: 10, bottom: 28, left: 4, right: 120, width: 116, height: 18 }]
  const clone = vi.fn()

  const range = {
    collapsed: options.collapsed ?? false,
    commonAncestorContainer: options.container ?? document.body,
    getClientRects: () => rects as DOMRect[],
    cloneRange: clone,
  } as unknown as Range

  clone.mockReturnValue(range)
  return range
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('resolveSelectionPayload', () => {
  it('reports the text, its rects and a cloned range', () => {
    const range = fakeRange()
    const payload = resolveSelectionPayload({ text: 'Churn it Saturday', ranges: [range], minLength: 1 })

    expect(payload?.text).toBe('Churn it Saturday')
    expect(payload?.rects).toHaveLength(1)
    // Cloned, because focusing the bar's input will collapse the live one.
    expect(range.cloneRange).toHaveBeenCalled()
    expect(payload?.range).toBeDefined()
  })

  it('ignores an empty or whitespace-only selection', () => {
    expect(resolveSelectionPayload({ text: '', ranges: [fakeRange()], minLength: 1 })).toBeNull()
    expect(resolveSelectionPayload({ text: '   \n ', ranges: [fakeRange()], minLength: 1 })).toBeNull()
  })

  it('honours a minimum length', () => {
    expect(resolveSelectionPayload({ text: 'ab', ranges: [fakeRange()], minLength: 5 })).toBeNull()
    expect(resolveSelectionPayload({ text: 'abcde', ranges: [fakeRange()], minLength: 5 })).not.toBeNull()
  })

  it('ignores a collapsed caret even when text is reported', () => {
    const payload = resolveSelectionPayload({
      text: 'stale',
      ranges: [fakeRange({ collapsed: true })],
      minLength: 1,
    })

    expect(payload).toBeNull()
  })

  it('picks the first uncollapsed range when several are reported', () => {
    const collapsed = fakeRange({ collapsed: true })
    const real = fakeRange({ rects: [{ top: 40, bottom: 58, left: 0, right: 90, width: 90, height: 18 }] })

    const payload = resolveSelectionPayload({ text: 'x', ranges: [collapsed, real], minLength: 1 })
    expect(payload?.rects[0]?.top).toBe(40)
  })

  it('confines the selection to a root when one is given', () => {
    const root = document.createElement('article')
    const inside = document.createElement('p')
    const outside = document.createElement('p')
    root.append(inside)
    document.body.append(root, outside)

    expect(resolveSelectionPayload({
      text: 'x',
      ranges: [fakeRange({ container: inside })],
      root,
      minLength: 1,
    })).not.toBeNull()

    expect(resolveSelectionPayload({
      text: 'x',
      ranges: [fakeRange({ container: outside })],
      root,
      minLength: 1,
    })).toBeNull()
  })

  it('accepts a selection that spans the root element itself', () => {
    const root = document.createElement('article')
    document.body.append(root)

    expect(resolveSelectionPayload({
      text: 'x',
      ranges: [fakeRange({ container: root })],
      root,
      minLength: 1,
    })).not.toBeNull()
  })

  it('drops zero-sized rects and rejects a selection left with none', () => {
    const payload = resolveSelectionPayload({
      text: 'x',
      ranges: [fakeRange({ rects: [{ width: 0, height: 0 }] })],
      minLength: 1,
    })

    expect(payload).toBeNull()
  })

  it('keeps every rect of a multi-line selection, in order', () => {
    const payload = resolveSelectionPayload({
      text: 'two lines',
      ranges: [fakeRange({
        rects: [
          { top: 10, bottom: 28, left: 40, right: 300, width: 260, height: 18 },
          { top: 30, bottom: 48, left: 40, right: 210, width: 170, height: 18 },
        ],
      })],
      minLength: 1,
    })

    expect(payload?.rects.map(item => item.bottom)).toEqual([28, 48])
  })
})
