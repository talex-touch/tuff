import type { MorphSegment } from '../src/engine'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveTransition } from '../../liquid/src/spring'
import { diffSegments, isNumericWord, segmentNumber, segmentText, TextMorphEngine } from '../src/engine'

function idOfCharAt(segments: MorphSegment[], index: number): string {
  return segments[index]!.id
}

/**
 * jsdom ships no Web Animations API, so every `element.animate` call would be a
 * TypeError. The stub records what was asked for, which is also how the spring
 * fusion is observed: the duration the engine hands WAAPI is the only place the
 * resolved physics becomes visible from outside.
 */
interface AnimateCall {
  element: HTMLElement
  keyframes: unknown
  options: KeyframeAnimationOptions
}

function installWaapiStub() {
  const calls: AnimateCall[] = []
  const perElement = new WeakMap<HTMLElement, Animation[]>()
  const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
  const originalGetAnimations = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getAnimations')

  const animate = function (
    this: HTMLElement,
    keyframes: unknown,
    options: KeyframeAnimationOptions,
  ) {
    calls.push({ element: this, keyframes, options })
    const animation = {
      onfinish: null as (() => void) | null,
      currentTime: 0 as number | null,
      cancel() {
        this.currentTime = null
      },
      finish() {
        this.onfinish?.()
      },
    }
    const existing = perElement.get(this) ?? []
    existing.push(animation as unknown as Animation)
    perElement.set(this, existing)
    return animation as unknown as Animation
  }

  Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true })
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    value(this: HTMLElement) {
      return perElement.get(this) ?? []
    },
    configurable: true,
  })

  return {
    calls,
    restore() {
      for (const [name, descriptor] of [
        ['animate', originalAnimate],
        ['getAnimations', originalGetAnimations],
      ] as const) {
        if (descriptor)
          Object.defineProperty(HTMLElement.prototype, name, descriptor)
        else
          Reflect.deleteProperty(HTMLElement.prototype, name)
      }
    },
  }
}

function stubReducedMotion(matches: boolean) {
  window.matchMedia = (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

describe('segmentText', () => {
  it('cuts a value with no spaces per grapheme', () => {
    const segments = segmentText('abc', 'en')

    expect(segments.map(s => s.string)).toEqual(['a', 'b', 'c'])
  })

  it('mints a unique id for every segment, repeats included', () => {
    const segments = segmentText('aaa', 'en')
    const ids = new Set(segments.map(s => s.id))

    expect(segments).toHaveLength(3)
    expect(ids.size).toBe(3)
  })

  it('emits a newline segment per line break', () => {
    const segments = segmentText('one\ntwo', 'en')

    expect(segments.filter(s => s.string === '\n')).toHaveLength(1)
    expect(segments.map(segment => segment.string).join('')).toBe('one\ntwo')
  })
})

describe('diffSegments', () => {
  it('keeps the ids of words that survived', () => {
    const before = segmentText('cat dog', 'en')
    const catId = before.find(s => s.string === 'cat')!.id

    const { segments } = diffSegments(before, 'cat bird', 'en')

    expect(segments.find(s => s.string === 'cat')!.id).toBe(catId)
  })

  it('carries the shared characters of a replaced word onto the new one', () => {
    const before = segmentText('sound stage', 'en')
    const stageId = before.find(s => s.string === 'stage')!.id
    const { segments, splits } = diffSegments(before, 'sound stone', 'en')

    // Only s/t/e survive the replacement, not just its neighbouring separator.
    const oldChars = splits.get(stageId)!
    expect(segments.filter(s => oldChars.some(old => old.id === s.id))).toEqual(
      oldChars.filter(s => ['s', 't', 'e'].includes(s.string)),
    )
  })

  it('does not split an unrelated replacement to reuse a single matching character', () => {
    const before = segmentText('alpha zzz', 'en')
    const oldWord = before.find(segment => segment.string === 'zzz')!
    const { segments, splits } = diffSegments(before, 'alpha zqqq', 'en')

    expect(segments.map(segment => segment.string).join('')).toBe('alpha zqqq')
    expect(splits.has(oldWord.id)).toBe(false)
    expect(segments.find(segment => segment.string === 'zqqq')?.id).not.toBe(oldWord.id)
  })
})

describe('numeric place-value matching', () => {
  it('recognises quantities without swallowing hyphenated words', () => {
    expect(isNumericWord('1204')).toBe(true)
    expect(isNumericWord('1,204')).toBe(true)
    expect(isNumericWord('$1,234')).toBe(true)
    expect(isNumericWord('12.5%')).toBe(true)
    expect(isNumericWord('COVID-19')).toBe(false)
    expect(isNumericWord('2024-01-01')).toBe(false)
    expect(isNumericWord('abc')).toBe(false)
  })

  it('rolls only the places that changed', () => {
    const before = segmentNumber('1,204')
    const after = segmentNumber('1,318', before, undefined, '.')

    // thousands digit and the grouping comma are untouched, so they keep their ids
    expect(idOfCharAt(after, 0)).toBe(idOfCharAt(before, 0))
    expect(idOfCharAt(after, 1)).toBe(idOfCharAt(before, 1))
    // hundreds/tens/units all changed value, so all three are new elements
    expect(idOfCharAt(after, 2)).not.toBe(idOfCharAt(before, 2))
    expect(idOfCharAt(after, 3)).not.toBe(idOfCharAt(before, 3))
    expect(idOfCharAt(after, 4)).not.toBe(idOfCharAt(before, 4))
  })

  it('holds a digit that kept its column', () => {
    const before = segmentNumber('1204')
    const after = segmentNumber('1214', before, undefined, '.')

    expect(idOfCharAt(after, 0)).toBe(idOfCharAt(before, 0))
    expect(idOfCharAt(after, 1)).toBe(idOfCharAt(before, 1))
    expect(idOfCharAt(after, 2)).not.toBe(idOfCharAt(before, 2))
    expect(idOfCharAt(after, 3)).toBe(idOfCharAt(before, 3))
  })

  it('carries nothing across a magnitude jump of three places or more', () => {
    const before = segmentNumber('5')
    const after = segmentNumber('50000', before, undefined, '.')

    const beforeIds = new Set(before.map(s => s.id))
    expect(after.filter(s => beforeIds.has(s.id))).toHaveLength(0)
  })

  it('marks digits and symbols apart so they slide opposite ways', () => {
    const segments = segmentNumber('$1.5')

    expect(segments.map(s => s.kind)).toEqual(['symbol', 'digit', 'symbol', 'digit'])
  })
})

describe('textMorphEngine', () => {
  let host: HTMLElement
  let calls: AnimateCall[]
  let restoreWaapi: () => void
  let originalMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    originalMatchMedia = window.matchMedia
    stubReducedMotion(false)
    const waapi = installWaapiStub()
    calls = waapi.calls
    restoreWaapi = waapi.restore
    host = document.createElement('span')
    document.body.appendChild(host)
  })

  afterEach(() => {
    restoreWaapi()
    window.matchMedia = originalMatchMedia
    host.remove()
  })

  it.each([
    {
      name: 'ordinary spaces, tabs and repeated edge whitespace',
      values: ['  sound  stage  ', ' sound stone   ', '\t sound\t stone \t'],
    },
    {
      name: 'real NBSP mixed with ordinary spaces',
      values: [' A\u00A0B  ', ' A\u00A0C  ', ' A B\u00A0C '],
    },
    {
      name: 'blank lines, emoji graphemes and combining marks',
      values: ['👩🏽‍💻e\u0301', '👨‍👩‍👧‍👦o\u0308', '\n👩🏽‍💻 e\u0301\n\n '],
    },
    {
      name: 'paired numeric words with surrounding whitespace',
      values: ['  $1,204.50  12.5% ', ' $1,318.50   13.5%  ', ' $1,318.50\u00A0 13.5% '],
    },
  ])('preserves $name on first render and interrupted updates', ({ values }) => {
    const engine = new TextMorphEngine({ element: host, locale: 'en', numbers: true })

    try {
      for (const [index, value] of values.entries()) {
        engine.update(value)

        // Observe the real engine DOM, including BRs and nested numeric slots.
        // This is not a clipboard simulation: CSS selection still needs a browser.
        const current = Array.from(host.querySelectorAll('[tx-morph-item]:not([tx-morph-exiting])'))
        expect(current.map(item => item.tagName === 'BR' ? '\n' : item.textContent).join('')).toBe(value)
        expect(host.querySelectorAll('[tx-morph-sr]')).toHaveLength(1)
        expect(host.querySelector('[tx-morph-sr]')?.textContent).toBe(value)
        expect(Array.from(host.querySelectorAll('[tx-morph-item]'))
          .every(item => item.getAttribute('aria-hidden') === 'true')).toBe(true)

        // WAAPI never finishes here: the old fragments really remain during the check.
        if (index === 1)
          expect(host.querySelectorAll('[tx-morph-exiting]').length).toBeGreaterThan(0)
      }
    }
    finally {
      engine.destroy()
    }
  })

  it('takes both the duration and the curve from the spring, ignoring durationMs', () => {
    const expected = resolveTransition('snappy')

    const engine = new TextMorphEngine({ element: host, spring: 'snappy', durationMs: 9999 })
    engine.update('a')
    calls.length = 0
    engine.update('b')

    expect(calls.length).toBeGreaterThan(0)
    // The fade animations run at a fraction of the morph, so the full-length ones
    // are what carry the resolved duration.
    expect(calls.map(call => call.options.duration)).toContain(expected.duration)
    expect(calls.map(call => call.options.easing)).toContain(expected.easing)
    expect(calls.map(call => call.options.duration)).not.toContain(9999)

    engine.destroy()
  })

  it('uses durationMs when no spring is given', () => {
    const engine = new TextMorphEngine({ element: host, durationMs: 321 })
    engine.update('a')
    calls.length = 0
    engine.update('b')

    expect(calls.map(call => call.options.duration)).toContain(321)

    engine.destroy()
  })

  it('writes the value straight in under prefers-reduced-motion, leaving nothing to diff', () => {
    stubReducedMotion(true)

    const engine = new TextMorphEngine({ element: host, respectReducedMotion: true })
    engine.update('first')

    expect(host.textContent).toBe('first')
    expect(host.querySelector('[tx-morph-item]')).toBeNull()
    expect(host.hasAttribute('tx-morph-root')).toBe(false)

    // Consecutive plain updates must not accumulate old fragments.
    engine.update('second')
    expect(host.textContent).toBe('second')
    expect(host.querySelectorAll('[tx-morph-exiting]')).toHaveLength(0)

    engine.destroy()
  })

  it('writes plain text without morph fragments when explicitly disabled', () => {
    const engine = new TextMorphEngine({ element: host, disabled: true })
    engine.update('plain')

    expect(host.textContent).toBe('plain')
    expect(host.querySelector('[tx-morph-item]')).toBeNull()

    engine.destroy()
  })

  it('gives numeric characters a slot to slide inside', () => {
    const engine = new TextMorphEngine({ element: host, numbers: true })
    engine.update('1204')

    const slots = host.querySelectorAll('[tx-morph-slot]')
    expect(slots).toHaveLength(4)
    expect(slots[0]?.getAttribute('tx-morph-kind')).toBe('digit')

    engine.destroy()
  })

  it('falls back to character morphing when numbers are off', () => {
    const engine = new TextMorphEngine({ element: host, numbers: false })
    engine.update('1204')

    expect(host.querySelectorAll('[tx-morph-slot]')).toHaveLength(0)

    engine.destroy()
  })

  it('strips its own attributes and the readable copy on destroy', () => {
    const engine = new TextMorphEngine({ element: host, debug: true })
    engine.update('gone')

    engine.destroy()

    expect(host.hasAttribute('tx-morph-root')).toBe(false)
    expect(host.hasAttribute('tx-morph-debug')).toBe(false)
    expect(host.querySelector('[tx-morph-sr]')).toBeNull()
  })
})
