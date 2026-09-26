// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type ComponentPublicInstance,
  defineComponent,
  h,
  nextTick,
  type PropType,
  reactive,
  ref,
  watch
} from 'vue'
import CoreBoxSelectionBlock from '~/components/render/CoreBoxSelectionBlock.vue'
import { LIST_FLIP_DURATION_MS, useListFlip } from './useListFlip'
import { useSelectionBlock } from './useSelectionBlock'

/** Each row is a 44px BoxItem with 4px above and below it. */
const ROW_PITCH = 52
const ROW_INSET_X = 8
const ROW_INSET_Y = 4
const LIST_WIDTH = 320
/** flip-layout's easing: the rows and anything riding them decelerate without overshoot. */
const FLIP_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

const view = reactive({
  /** The list's scroll offset inside the viewport. */
  scrollTop: 0,
  height: 4 * ROW_PITCH,
  listWidth: LIST_WIDTH
})
const flags = reactive({ enabled: true, motion: true })

/** Every element whose box was read, so a test can tell which rows the FLIP looked at. */
const reads = new Set<Element>()

function rowIndexOf(row: Element): number {
  return Array.prototype.indexOf.call(row.parentElement?.children ?? [], row)
}

/**
 * jsdom lays nothing out. The viewport sits at the top of the window, the list scrolls inside it,
 * and rows stack at ROW_PITCH; the block is where its `translate` puts it.
 */
function boxOf(el: Element): DOMRect {
  reads.add(el)
  const listTop = -view.scrollTop
  if (el.classList.contains('viewport')) return new DOMRect(0, 0, LIST_WIDTH, view.height)
  if (el.classList.contains('item-list')) return new DOMRect(0, listTop, view.listWidth, 4000)
  if (el.classList.contains('CoreBox-SelectionBlock')) {
    const block = el as HTMLElement
    const [x, y] = block.style.getPropertyValue('translate').split(' ').map(Number.parseFloat)
    return new DOMRect(
      x ?? 0,
      listTop + (y ?? 0),
      Number.parseFloat(block.style.getPropertyValue('width')) || 0,
      Number.parseFloat(block.style.getPropertyValue('height')) || 0
    )
  }
  if ((el as HTMLElement).dataset?.flipKey) {
    return new DOMRect(0, listTop + rowIndexOf(el) * ROW_PITCH, view.listWidth, ROW_PITCH)
  }
  return new DOMRect()
}

/** BoxItem layout offsets, for the selection block. */
function offsetOf(el: HTMLElement, side: 'left' | 'top' | 'width' | 'height'): number {
  if (!el.classList.contains('BoxItem')) return 0
  const box = {
    left: ROW_INSET_X,
    top: rowIndexOf(el.parentElement!) * ROW_PITCH + ROW_INSET_Y,
    width: view.listWidth - ROW_INSET_X * 2,
    height: ROW_PITCH - ROW_INSET_Y * 2
  }
  return box[side]
}

interface AnimateCall {
  el: Element
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
}

let animations: AnimateCall[] = []

function animated(): Map<Element, AnimateCall> {
  return new Map(animations.map((call) => [call.el, call]))
}

const Harness = defineComponent({
  props: {
    rows: { type: Array as PropType<string[]>, required: true },
    focus: { type: Number, default: -1 },
    withBlock: { type: Boolean, default: false },
    /** What CoreBox does for a new query: scroll back to the top once the rows have landed. */
    resetScroll: { type: Boolean, default: false },
    /** The preview pane narrowing the list in the same update. */
    narrowTo: { type: Number, default: 0 }
  },
  setup(props) {
    const viewport = ref<HTMLElement | null>(null)
    const list = ref<HTMLElement | null>(null)
    const block = ref<ComponentPublicInstance | null>(null)
    const selection = props.withBlock
      ? useSelectionBlock({
          container: list,
          block: () => block.value?.$el as HTMLElement | undefined,
          focus: () => props.focus,
          items: () => props.rows,
          shouldAnimate: () => flags.motion
        })
      : null
    useListFlip({
      container: list,
      viewport,
      items: () => props.rows,
      enabled: () => flags.enabled,
      shouldAnimate: () => flags.motion,
      follower: selection?.follower
    })
    watch(
      () => props.rows,
      () => {
        if (props.resetScroll) view.scrollTop = 0
        if (props.narrowTo) view.listWidth = props.narrowTo
      },
      { flush: 'post' }
    )
    return () =>
      h('div', { ref: viewport, class: 'viewport' }, [
        h('div', { ref: list, class: 'item-list' }, [
          ...props.rows.map((id, index) =>
            h(
              'div',
              { key: id, class: 'CoreBoxRender', 'data-flip-key': id, 'data-flip': 'move' },
              [h('div', { class: ['BoxItem', { 'is-active': index === props.focus }] })]
            )
          ),
          ...(props.withBlock
            ? [h(CoreBoxSelectionBlock, { ref: block, key: 'selection-block' })]
            : [])
        ])
      ])
  }
})

function ids(prefix: string, count: number, from = 0): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${from + index}`)
}

let wrapper: VueWrapper | null = null

async function mountList(props: {
  rows: string[]
  focus?: number
  withBlock?: boolean
}): Promise<VueWrapper> {
  wrapper = mount(Harness, { props, attachTo: document.body })
  await nextTick()
  reads.clear()
  return wrapper
}

/** Lets the flush land and the FLIP play, which runs once the flush is over. */
async function settle(): Promise<void> {
  await nextTick()
  await nextTick()
}

function rowOf(harness: VueWrapper, id: string): Element {
  return harness.get(`[data-flip-key="${id}"]`).element
}

beforeEach(() => {
  view.scrollTop = 0
  view.height = 4 * ROW_PITCH
  view.listWidth = LIST_WIDTH
  flags.enabled = true
  flags.motion = true
  reads.clear()
  animations = []
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return boxOf(this)
  })
  for (const [key, side] of [
    ['offsetLeft', 'left'],
    ['offsetTop', 'top'],
    ['offsetWidth', 'width'],
    ['offsetHeight', 'height']
  ] as const) {
    vi.spyOn(HTMLElement.prototype, key, 'get').mockImplementation(function (this: HTMLElement) {
      return offsetOf(this, side)
    })
  }
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: vi.fn(function (
      this: Element,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions
    ): Animation {
      animations.push({ el: this, keyframes, options })
      return { cancel: () => {}, playState: 'running' } as unknown as Animation
    })
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  document.body.replaceChildren()
})

describe('useListFlip', () => {
  it('slides the rows an update moved, from where they were, and leaves new and unmoved rows be', async () => {
    const harness = await mountList({ rows: ['a', 'b', 'c', 'd'] })

    // A deferred batch lands `x` above `b`; `d` drops out.
    await harness.setProps({ rows: ['a', 'x', 'b', 'c'] })
    await settle()

    const played = animated()
    expect([...played.keys()]).toEqual([rowOf(harness, 'b'), rowOf(harness, 'c')])
    for (const call of played.values()) {
      expect(call.keyframes).toEqual([
        { transform: 'translate(0px, -52px)' },
        { transform: 'translate(0px, 0px)' }
      ])
      expect(call.options).toEqual({ duration: LIST_FLIP_DURATION_MS, easing: FLIP_EASING })
    }
    expect(LIST_FLIP_DURATION_MS).toBeLessThanOrEqual(180)
  })

  it('reads only the rows within one viewport of the visible part of the list', async () => {
    const rows = ids('r', 40)
    // Rows 20–23 are on screen; one viewport either side reaches rows 16–27.
    view.scrollTop = 20 * ROW_PITCH
    const harness = await mountList({ rows })
    const rowAt = (index: number): Element => rowOf(harness, `r${index}`)

    await harness.setProps({ rows: ['new', ...rows] })
    await settle()

    expect([...animated().keys()]).toEqual(ids('r', 12, 16).map((id) => rowOf(harness, id)))
    for (const index of [...Array.from({ length: 10 }, (_, i) => i), 29, 30, 35, 39]) {
      expect(reads.has(rowAt(index))).toBe(false)
    }
  })

  it('does not play a scroll between the two reads as a move', async () => {
    view.scrollTop = 100
    const harness = await mountList({ rows: ['a', 'b', 'c'] })

    // The same rows again (a refresh), and CoreBox scrolls back to the top as they land.
    await harness.setProps({ rows: ['a', 'b', 'c'], resetScroll: true })
    await settle()

    expect(view.scrollTop).toBe(0)
    expect(animations).toEqual([])
  })

  it('does not play a width change alone', async () => {
    const harness = await mountList({ rows: ['a', 'b', 'c'] })

    await harness.setProps({ rows: ['a', 'b', 'c'], narrowTo: 128 })
    await settle()

    expect(animations).toEqual([])
  })

  it('reads and plays nothing while the setting or the motion gate is off', async () => {
    for (const off of [{ enabled: false }, { motion: false }]) {
      Object.assign(flags, { enabled: true, motion: true }, off)
      const harness = await mountList({ rows: ['a', 'b', 'c'] })

      await harness.setProps({ rows: ['x', 'a', 'b', 'c'] })
      await settle()

      expect(animations).toEqual([])
      expect(reads.size).toBe(0)
      harness.unmount()
      wrapper = null
    }
  })
})

describe('useListFlip with the selection block', () => {
  it('carries the block with its row: the same delta, duration and easing, in the same pass', async () => {
    const harness = await mountList({ rows: ['a', 'b', 'c'], focus: 1, withBlock: true })
    const block = harness.get('.CoreBox-SelectionBlock').element as HTMLElement
    expect(block.style.getPropertyValue('translate')).toBe('8px 56px')

    // A batch lands above the selection, which follows its row down.
    await harness.setProps({ rows: ['x', 'a', 'b', 'c'], focus: 2 })
    await settle()

    // It rests on the row's new place; the FLIP plays it from the old one.
    expect(block.style.getPropertyValue('translate')).toBe('8px 108px')
    const played = animated()
    const row = played.get(rowOf(harness, 'b'))
    const riding = played.get(block)
    expect(row).toBeDefined()
    expect(riding).toBeDefined()
    expect(riding?.keyframes).toEqual(row?.keyframes)
    expect(riding?.options).toEqual(row?.options)
    expect(riding?.keyframes[0]).toEqual({ transform: 'translate(0px, -52px)' })
    // One `playFlip` pass: nothing else was animated between the rows and the block.
    expect(animations.map((call) => call.el)).toEqual([
      rowOf(harness, 'a'),
      rowOf(harness, 'b'),
      rowOf(harness, 'c'),
      block
    ])
  })

  it('does not carry the block when the selection moved to a row that did not move', async () => {
    const harness = await mountList({ rows: ['a', 'b', 'c'], focus: 2, withBlock: true })
    const block = harness.get('.CoreBox-SelectionBlock').element as HTMLElement

    // A new query: `a` stays on top and takes the selection; `c` drops out.
    await harness.setProps({ rows: ['a', 'y', 'b'], focus: 0 })
    await settle()

    expect(block.style.getPropertyValue('translate')).toBe('8px 4px')
    expect(animated().has(block)).toBe(false)
    expect([...animated().keys()]).toEqual([rowOf(harness, 'b')])
  })

  it('never reads the block as a row, even while it is hidden', async () => {
    const harness = await mountList({ rows: ['a', 'b', 'c'], focus: -1, withBlock: true })
    const block = harness.get('.CoreBox-SelectionBlock').element

    await harness.setProps({ rows: ['x', 'a', 'b', 'c'] })
    await settle()

    expect(reads.has(block)).toBe(false)
    expect([...animated().keys()]).toEqual(['a', 'b', 'c'].map((id) => rowOf(harness, id)))
  })
})

/**
 * Streamed batches can land closer together than LIST_FLIP_DURATION_MS. A row the previous batch
 * set sliding is drawn off its resting place, and a rect read includes that; the next slide
 * replaces the old one, so it has to start where the row is drawn.
 */
describe('useListFlip over a slide still in flight', () => {
  /** The slides running on each element; each is still at its first keyframe. */
  const running = new Map<Element, Animation[]>()
  const startOffsets = new WeakMap<Animation, number>()

  function drawnOffset(el: Element): number {
    const latest = running.get(el)?.at(-1)
    return latest ? (startOffsets.get(latest) ?? 0) : 0
  }

  function startOf(call: AnimateCall | undefined): Keyframe | undefined {
    return call?.keyframes[0]
  }

  beforeEach(() => {
    running.clear()
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element
    ) {
      const box = boxOf(this)
      return new DOMRect(box.x, box.y + drawnOffset(this), box.width, box.height)
    })
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: vi.fn(function (
        this: Element,
        keyframes: Keyframe[],
        options: KeyframeAnimationOptions
      ): Animation {
        animations.push({ el: this, keyframes, options })
        const target = this
        const animation = {
          playState: 'running',
          cancel: () => {
            running.set(
              target,
              (running.get(target) ?? []).filter((entry) => entry !== animation)
            )
          }
        } as unknown as Animation
        const dy = /translate\([^,]+,\s*(-?[\d.]+)px\)/.exec(String(keyframes[0]?.transform))
        startOffsets.set(animation, Number(dy?.[1] ?? 0))
        running.set(target, [...(running.get(target) ?? []), animation])
        return animation
      })
    })
    Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
      configurable: true,
      value(this: Element): Animation[] {
        return [...(running.get(this) ?? [])]
      }
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
  })

  it('restarts a sliding row from where it is drawn, not from where it rests', async () => {
    const harness = await mountList({ rows: ['a', 'b', 'c'] })

    // `x` lands on top: a, b and c start sliding down from one row up.
    await harness.setProps({ rows: ['x', 'a', 'b', 'c'] })
    await settle()
    const firstBatch = animations.length
    expect(firstBatch).toBe(3)

    // `y` lands before those slides have moved: a, b and c are still drawn two rows up.
    await harness.setProps({ rows: ['y', 'x', 'a', 'b', 'c'] })
    await settle()

    const replayed = new Map(animations.slice(firstBatch).map((call) => [call.el, call]))
    for (const id of ['a', 'b', 'c']) {
      expect(startOf(replayed.get(rowOf(harness, id))), id).toEqual({
        transform: 'translate(0px, -104px)'
      })
      // The earlier slide is gone: left running under the new one, it would pull the row back.
      expect(running.get(rowOf(harness, id))).toHaveLength(1)
    }
    expect(startOf(replayed.get(rowOf(harness, 'x')))).toEqual({
      transform: 'translate(0px, -52px)'
    })
  })

  it('carries the block from where its row is drawn', async () => {
    const harness = await mountList({ rows: ['a', 'b', 'c'], focus: 1, withBlock: true })
    const block = harness.get('.CoreBox-SelectionBlock').element as HTMLElement

    await harness.setProps({ rows: ['x', 'a', 'b', 'c'], focus: 2 })
    await settle()
    const firstBatch = animations.length

    await harness.setProps({ rows: ['y', 'x', 'a', 'b', 'c'], focus: 3 })
    await settle()

    const replayed = new Map(animations.slice(firstBatch).map((call) => [call.el, call]))
    expect(block.style.getPropertyValue('translate')).toBe('8px 160px')
    expect(startOf(replayed.get(rowOf(harness, 'b')))).toEqual({
      transform: 'translate(0px, -104px)'
    })
    expect(startOf(replayed.get(block))).toEqual(startOf(replayed.get(rowOf(harness, 'b'))))
    expect(running.get(block)).toHaveLength(1)
  })

  it('leaves a row’s CSS animation alone, such as its stagger-in', async () => {
    const harness = await mountList({ rows: ['a', 'b'] })
    const staggerIn = {
      animationName: 'item-stagger-in',
      playState: 'running',
      cancel: vi.fn()
    } as unknown as Animation
    running.set(rowOf(harness, 'a'), [staggerIn])

    await harness.setProps({ rows: ['x', 'a', 'b'] })
    await settle()

    expect(staggerIn.cancel).not.toHaveBeenCalled()
    expect(running.get(rowOf(harness, 'a'))?.[0]).toBe(staggerIn)
  })
})
