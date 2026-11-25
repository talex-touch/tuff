import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSignal, ref } from '../src/reactivity'
import { createTextSelectionTracker } from '../src/utils/selection'
import {
  adoptStyles,
  camelToKebab,
  clearStyleSheetCache,
  coerceArray,
  coerceBoolean,
  coerceJson,
  coerceNumber,
  dispatchCustomEvent,
  kebabToCamel,
  reflectAttribute,
} from '../src/wc'

// Lightweight React hook harness for testing src/react.ts without requiring React runtime installed
const cleanups: Array<() => void> = []
const storeNotifications: Array<() => void> = []

vi.mock('react', () => ({
  useRef: <T>(initialValue: T) => ({ current: initialValue }),
  useMemo: <T>(factory: () => T) => factory(),
  useEffect: (fn: () => void | (() => void)) => {
    const cleanup = fn()
    if (typeof cleanup === 'function')
      cleanups.push(cleanup)
  },
  useSyncExternalStore: <T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T) => {
    const notify = vi.fn()
    storeNotifications.push(notify)
    const unsub = subscribe(notify)
    cleanups.push(unsub)
    return getSnapshot()
  },
}))

import { useComputed, useReactiveScope, useSignal } from '../src/react'

afterEach(() => {
  while (cleanups.length > 0)
    cleanups.pop()?.()
  storeNotifications.length = 0
  clearStyleSheetCache()
  document.body.innerHTML = ''
})

describe('react bridge hooks', () => {
  it('useSignal subscribes to Ref and Signal updates via useSyncExternalStore', () => {
    const count = ref(10)
    expect(useSignal(count)).toBe(10)
    const notify = storeNotifications.at(-1)!

    count.value = 11
    expect(notify).toHaveBeenCalledTimes(1)

    const sig = createSignal('vue')
    expect(useSignal(sig)).toBe('vue')
    const sigNotify = storeNotifications.at(-1)!
    sig.set('react')
    expect(sigNotify).toHaveBeenCalledTimes(1)
  })

  it('useComputed derives reactive values and useReactiveScope stops on cleanup', () => {
    const a = ref(2)
    const b = ref(3)
    expect(useComputed(() => a.value + b.value)).toBe(5)
    const notify = storeNotifications.at(-1)!
    a.value = 7
    expect(notify).toHaveBeenCalledTimes(1)

    const scoped = useReactiveScope((scope) => {
      expect(scope.active).toBe(true)
      return { scope, ok: true }
    })
    expect(scoped.ok).toBe(true)
    expect(scoped.scope.active).toBe(true)

    cleanups.pop()?.()
    expect(scoped.scope.active).toBe(false)
  })
})

describe('wc helpers & native text selection tracker', () => {
  it('coerces attributes and reflects properties cleanly', () => {
    expect(camelToKebab('modelValue')).toBe('model-value')
    expect(kebabToCamel('model-value')).toBe('modelValue')
    expect(coerceBoolean('')).toBe(true)
    expect(coerceBoolean('true')).toBe(true)
    expect(coerceBoolean('false')).toBe(false)
    expect(coerceBoolean(null, false)).toBe(false)
    expect(coerceNumber('42.5')).toBe(42.5)
    expect(coerceNumber('bad', 7)).toBe(7)
    expect(coerceJson('{"a":1}', {})).toEqual({ a: 1 })
    expect(coerceArray('[1,2,3]')).toEqual([1, 2, 3])

    const el = document.createElement('div')
    reflectAttribute(el, 'open', true)
    expect(el.getAttribute('open')).toBe('')
    reflectAttribute(el, 'open', false)
    expect(el.hasAttribute('open')).toBe(false)
  })

  it('dispatches bubbling composed CustomEvents and adopts fallback styles in ShadowRoot', () => {
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    document.body.appendChild(host)

    let received: unknown
    host.addEventListener('tx-change', (ev) => {
      received = (ev as CustomEvent).detail
    })

    const inner = document.createElement('button')
    shadow.appendChild(inner)
    dispatchCustomEvent(inner, 'tx-change', { value: 'ok' })
    expect(received).toEqual({ value: 'ok' })

    adoptStyles(shadow, ['.tx-btn { color: red; }'])
    adoptStyles(shadow, ['.tx-btn { color: red; }'])
    const styleNodes = shadow.querySelectorAll('style')
    expect(styleNodes.length).toBeLessThanOrEqual(1)
  })

  it('tracks native selectionchange events without @vueuse/core', () => {
    const tracker = createTextSelectionTracker(document)
    expect(tracker.text.value).toBe('')
    expect(tracker.ranges.value).toEqual([])
    document.dispatchEvent(new Event('selectionchange'))
    expect(tracker.text.value).toBe('')
    tracker.destroy()
  })
})
