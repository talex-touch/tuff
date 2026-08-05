import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxConversationStream from '../src/TxConversationStream.vue'

interface Message {
  id: string
  text: string
}

function makeMessages(from: number, count: number): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${from + i}`,
    text: `Message ${from + i}`,
  }))
}

// ---------------------------------------------------------------------------
// Observer stubs with manually triggerable callbacks (scroll.test.ts pattern).
// ---------------------------------------------------------------------------

let resizeCallbacks: ResizeObserverCallback[] = []
let intersectionCallbacks: IntersectionObserverCallback[] = []

class ResizeObserverStub {
  constructor(private callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback)
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class IntersectionObserverStub {
  constructor(private callback: IntersectionObserverCallback) {
    intersectionCallbacks.push(callback)
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  resizeCallbacks = []
  intersectionCallbacks = []
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// jsdom has no layout: scroller metrics are stubbed per element, and resize
// entries are hand-fed through the captured callbacks.
// ---------------------------------------------------------------------------

interface ScrollerControl {
  element: HTMLElement
  setScrollHeight: (value: number) => void
}

function stubScroller(wrapper: VueWrapper<any>, options: { clientHeight: number, scrollHeight: number }): ScrollerControl {
  const element = wrapper.find('.tx-conversation-stream__scroller').element as HTMLElement
  let scrollHeight = options.scrollHeight

  Object.defineProperty(element, 'clientHeight', {
    get: () => options.clientHeight,
    configurable: true,
  })
  Object.defineProperty(element, 'scrollHeight', {
    get: () => scrollHeight,
    configurable: true,
  })
  Object.defineProperty(element, 'scrollTop', {
    value: 0,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(element, 'scrollTo', {
    value: (opts: { top: number }) => {
      (element as any).scrollTop = opts.top
    },
    configurable: true,
  })

  return {
    element,
    setScrollHeight: (value: number) => {
      scrollHeight = value
    },
  }
}

function fireResize(target: Element, height: number): void {
  const entry = {
    target,
    contentRect: { height } as DOMRectReadOnly,
    borderBoxSize: [{ blockSize: height, inlineSize: 0 }],
  } as unknown as ResizeObserverEntry
  for (const callback of resizeCallbacks)
    callback([entry], {} as ResizeObserver)
}

function fireIntersection(): void {
  for (const callback of intersectionCallbacks) {
    callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  }
}

function mountStream(props: Record<string, unknown> = {}) {
  return mount(TxConversationStream as any, {
    props: {
      items: makeMessages(0, 500),
      itemKey: 'id',
      estimatedItemHeight: 96,
      overscan: 4,
      ...props,
    },
    slots: {
      item: `<template #item="{ item }"><div class="msg">{{ item.text }}</div></template>`,
      empty: `<template #empty><div class="empty-slot">nothing yet</div></template>`,
    },
  })
}

describe('txConversationStream', () => {
  it('renders a bounded window over 500 items', async () => {
    const wrapper = mountStream()
    stubScroller(wrapper, { clientHeight: 600, scrollHeight: 500 * 96 })

    const scroller = wrapper.find('.tx-conversation-stream__scroller').element
    fireResize(scroller, 600)
    await nextTick()

    const rendered = wrapper.findAll('.tx-conversation-stream__item')
    // ~7 visible + 2×4 overscan; anything under 30 proves virtualization.
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.length).toBeLessThan(30)
    // Plus the always-mounted live tail.
    expect(wrapper.find('.tx-conversation-stream__live').exists()).toBe(true)
  })

  it('keeps window content aligned with item keys (no swapped rows)', async () => {
    const wrapper = mountStream()
    const control = stubScroller(wrapper, { clientHeight: 600, scrollHeight: 500 * 96 })
    fireResize(control.element, 600)

    // Scroll somewhere in the middle.
    ;(control.element as any).scrollTop = 96 * 200
    await wrapper.find('.tx-conversation-stream__scroller').trigger('scroll')
    await nextTick()

    const texts = wrapper.findAll('.tx-conversation-stream__item .msg').map(node => node.text())
    const numbers = texts.map(text => Number(text.replace('Message ', '')))
    for (let i = 1; i < numbers.length; i++)
      expect(numbers[i]).toBe(numbers[i - 1]! + 1)
    expect(numbers[0]).toBeGreaterThan(150)
  })

  it('anchors the viewport across a prepend', async () => {
    const items = makeMessages(100, 300)
    const wrapper = mountStream({ items })
    const control = stubScroller(wrapper, { clientHeight: 600, scrollHeight: 300 * 96 })
    fireResize(control.element, 600)
    // Let the opening scroll-to-latest settle before repositioning.
    await nextTick()

    // User is parked mid-history.
    ;(control.element as any).scrollTop = 5000
    await wrapper.find('.tx-conversation-stream__scroller').trigger('scroll')

    await wrapper.setProps({ items: [...makeMessages(50, 50), ...items] })
    await nextTick()
    await nextTick()

    // 50 prepended × 96 estimated = 4800 added above the anchor.
    expect((control.element as any).scrollTop).toBe(5000 + 50 * 96)
  })

  it('loads older history via the sentinel with concurrency and hasMore guards', async () => {
    let resolveLoad: (value: { hasMore: boolean }) => void = () => {}
    const loadOlder = vi.fn(
      () => new Promise<{ hasMore: boolean }>((resolve) => {
        resolveLoad = resolve
      }),
    )
    const wrapper = mountStream({ loadOlder })
    stubScroller(wrapper, { clientHeight: 600, scrollHeight: 500 * 96 })

    fireIntersection()
    fireIntersection() // in-flight: must not double-fire
    expect(loadOlder).toHaveBeenCalledTimes(1)

    resolveLoad({ hasMore: false })
    await flushPromises()

    fireIntersection()
    expect(loadOlder).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.tx-conversation-stream__spinner').exists()).toBe(false)
  })

  it('surfaces loader failures with a working retry', async () => {
    const loadOlder = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ hasMore: true })
    const wrapper = mountStream({ loadOlder })
    stubScroller(wrapper, { clientHeight: 600, scrollHeight: 500 * 96 })

    fireIntersection()
    await flushPromises()

    expect(wrapper.emitted('load-error')).toHaveLength(1)
    const retry = wrapper.find('.tx-conversation-stream__retry')
    expect(retry.exists()).toBe(true)

    await retry.trigger('click')
    await flushPromises()
    expect(loadOlder).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.tx-conversation-stream__retry').exists()).toBe(false)
  })

  it('follows live growth at the bottom and never yanks a detached reader', async () => {
    const wrapper = mountStream()
    const control = stubScroller(wrapper, { clientHeight: 600, scrollHeight: 2000 })
    fireResize(control.element, 600)
    await nextTick()

    // Opening scroll pinned us to the bottom.
    control.setScrollHeight(2400)
    fireResize(wrapper.find('.tx-conversation-stream__live').element, 300)
    expect((control.element as any).scrollTop).toBe(2400)

    // Walk away, then grow again — position must hold and the pill appears.
    ;(control.element as any).scrollTop = 300
    await wrapper.find('.tx-conversation-stream__scroller').trigger('scroll')
    control.setScrollHeight(3000)
    fireResize(wrapper.find('.tx-conversation-stream__live').element, 900)
    expect((control.element as any).scrollTop).toBe(300)

    await nextTick()
    const pill = wrapper.find('.tx-conversation-stream__pill')
    expect(pill.exists()).toBe(true)

    await pill.trigger('click')
    expect((control.element as any).scrollTop).toBe(3000)
    await nextTick()
    expect(wrapper.find('.tx-conversation-stream__pill').exists()).toBe(false)
  })

  it('emits at-bottom-change transitions', async () => {
    const wrapper = mountStream()
    const control = stubScroller(wrapper, { clientHeight: 600, scrollHeight: 4000 })
    fireResize(control.element, 600)
    await nextTick()

    ;(control.element as any).scrollTop = 100
    await wrapper.find('.tx-conversation-stream__scroller').trigger('scroll')

    const events = wrapper.emitted('at-bottom-change')
    expect(events?.at(-1)).toEqual([false])
  })

  it('renders the empty slot without a scroll scaffold', () => {
    const wrapper = mountStream({ items: [] })
    expect(wrapper.find('.empty-slot').exists()).toBe(true)
    expect(wrapper.find('.tx-conversation-stream__item').exists()).toBe(false)
    expect(wrapper.find('.tx-conversation-stream__pill').exists()).toBe(false)
  })

  it('exposes scrollToIndex and scrollToBottom', async () => {
    const wrapper = mountStream()
    const control = stubScroller(wrapper, { clientHeight: 600, scrollHeight: 500 * 96 })
    fireResize(control.element, 600)

    wrapper.vm.scrollToIndex(10)
    expect((control.element as any).scrollTop).toBe(10 * 96)

    wrapper.vm.scrollToBottom()
    expect((control.element as any).scrollTop).toBe(500 * 96)
    expect(wrapper.vm.atBottom).toBe(true)
  })
})
