import type { MorphSegment } from '../src/engine'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveTransition } from '../../liquid/src/spring'
import { diffSegments, isNumericWord, segmentNumber, segmentText, TextMorphEngine } from '../src/engine'

const NBSP = '\u00A0'

function textOf(segments: MorphSegment[]): string {
  return segments.map(segment => segment.string).join('')
}

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

  return calls
}

function removeWaapiStub() {
  Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
}

function stubReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

describe('segmentText', () => {
  it('cuts a spaced value into words with the space kept as a segment', () => {
    const segments = segmentText('hello world', 'en')

    expect(textOf(segments)).toBe(`hello${NBSP}world`)
    expect(segments.map(s => s.string)).toContain('hello')
    expect(segments.map(s => s.string)).toContain('world')
  })

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
    expect(textOf(segments)).toBe('one\ntwo')
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
    const { segments } = diffSegments(before, 'sound stone', 'en')

    // "stage" -> "stone" shares s/t/e, so those characters keep their identity
    // rather than the whole word being swapped.
    const beforeIds = new Set(before.map(s => s.id))
    const carried = segments.filter(s => beforeIds.has(s.id) && s.string !== 'sound')

    expect(carried.length).toBeGreaterThan(0)
    expect(textOf(segments)).toBe(`sound${NBSP}stone`)
  })

  it('does not pair words that share too little', () => {
    const before = segmentText('alpha zzz', 'en')
    const { segments } = diffSegments(before, 'alpha qqqq', 'en')

    const zzzChars = before.filter(s => s.string === 'zzz').map(s => s.id)
    const reused = segments.filter(s => zzzChars.includes(s.id))

    expect(reused).toHaveLength(0)
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

  beforeEach(() => {
    stubReducedMotion(false)
    calls = installWaapiStub()
    host = document.createElement('span')
    document.body.appendChild(host)
  })

  afterEach(() => {
    removeWaapiStub()
    vi.unstubAllGlobals()
    host.remove()
  })

  it('splits the value into aria-hidden segments behind one readable copy', () => {
    const engine = new TextMorphEngine({ element: host })
    engine.update('hi')

    expect(host.hasAttribute('tx-morph-root')).toBe(true)
    expect(host.querySelector('[tx-morph-sr]')?.textContent).toBe('hi')

    const items = Array.from(host.querySelectorAll('[tx-morph-item]'))
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(item => item.getAttribute('aria-hidden') === 'true')).toBe(true)

    engine.destroy()
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

    const engine = new TextMorphEngine({ element: host })
    engine.update('first')

    expect(host.textContent).toBe('first')
    expect(host.querySelector('[tx-morph-item]')).toBeNull()
    expect(host.hasAttribute('tx-morph-root')).toBe(false)

    // Re-enabling motion must start from a clean slate: diffing against the
    // segments of a value that was written as plain text would animate elements
    // that were never in the DOM.
    engine.update('second')
    expect(host.textContent).toBe('second')
    expect(host.querySelectorAll('[tx-morph-exiting]')).toHaveLength(0)

    engine.destroy()
  })

  it('honours disabled the same way, without consulting the media query', () => {
    const engine = new TextMorphEngine({ element: host, disabled: true })
    engine.update('plain')

    expect(host.textContent).toBe('plain')
    expect(host.querySelector('[tx-morph-item]')).toBeNull()

    engine.destroy()
  })

  it('gives numeric characters a slot to slide inside', () => {
    const engine = new TextMorphEngine({ element: host })
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

    expect(host.hasAttribute('tx-morph-debug')).toBe(true)

    engine.destroy()

    expect(host.hasAttribute('tx-morph-root')).toBe(false)
    expect(host.hasAttribute('tx-morph-debug')).toBe(false)
    expect(host.querySelector('[tx-morph-sr]')).toBeNull()
  })
})
