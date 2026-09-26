// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type PropType } from 'vue'
import {
  POINTER_IDLE_ATTR,
  SELECTION_BLOCK_ATTR,
  SELECTION_STEP_MS,
  useSelectionBlock
} from './useSelectionBlock'

interface Row {
  id: string
  custom?: boolean
  /** BoxItem height; 44px unless set. */
  height?: number
}

/** BoxItem: `mx-2 my-1 h-44px`, so each default row is 44px plus 4px above and below. */
const ROW_HEIGHT = 44
const ROW_INSET_X = 8
const ROW_INSET_Y = 4
const CUSTOM_ROW_HEIGHT = 120

const layout = { listWidth: 320 }
const gate = ref(true)

/** The height a row takes in the list; the block (no BoxItem inside) takes none. */
function rowOuterHeight(row: Element): number {
  const content = row.firstElementChild as HTMLElement | null
  if (!content) return 0
  if (content.classList.contains('BoxItem')) {
    return Number(content.dataset.height ?? ROW_HEIGHT) + ROW_INSET_Y * 2
  }
  return CUSTOM_ROW_HEIGHT
}

/** jsdom lays nothing out: a BoxItem's box follows from the rows above it. */
function layoutBoxOf(el: HTMLElement): {
  left: number
  top: number
  width: number
  height: number
} {
  if (!el.classList.contains('BoxItem')) return { left: 0, top: 0, width: 0, height: 0 }
  const row = el.parentElement!
  let top = 0
  for (const sibling of Array.from(row.parentElement!.children)) {
    if (sibling === row) break
    top += rowOuterHeight(sibling)
  }
  return {
    left: ROW_INSET_X,
    top: top + ROW_INSET_Y,
    width: layout.listWidth - ROW_INSET_X * 2,
    height: Number(el.dataset.height ?? ROW_HEIGHT)
  }
}

const Harness = defineComponent({
  props: {
    rows: { type: Array as PropType<Row[]>, required: true },
    focus: { type: Number, required: true },
    grid: { type: Boolean, default: false }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    const list = ref<HTMLElement | null>(null)
    const block = ref<HTMLElement | null>(null)
    useSelectionBlock({
      container: list,
      block,
      focus: () => props.focus,
      items: () => props.rows,
      shouldAnimate: () => gate.value,
      pointerIdleHost: host
    })
    return () =>
      h('div', { ref: host, class: 'CoreBox-Wrapper' }, [
        props.grid
          ? h('section', { class: 'grid' })
          : h('div', { ref: list, class: 'item-list' }, [
              ...props.rows.map((row, index) =>
                h('div', { key: row.id, class: 'CoreBoxRender', 'data-flip-key': row.id }, [
                  row.custom
                    ? h('div', {
                        class: ['CoreBoxRender-Custom', { active: index === props.focus }]
                      })
                    : h('div', {
                        class: ['BoxItem', { 'is-active': index === props.focus }],
                        'data-height': row.height
                      })
                ])
              ),
              h('div', { ref: block, key: 'selection-block', class: 'CoreBox-SelectionBlock' })
            ])
      ])
  }
})

function rows(...ids: string[]): Row[] {
  return ids.map((id) => ({ id }))
}

let wrapper: VueWrapper | null = null

async function mountList(props: { rows: Row[]; focus: number }): Promise<VueWrapper> {
  wrapper = mount(Harness, { props, attachTo: document.body })
  await nextTick()
  return wrapper
}

function listOf(harness: VueWrapper): HTMLElement {
  return harness.get('.item-list').element as HTMLElement
}

function blockOf(harness: VueWrapper): HTMLElement {
  return harness.get('.CoreBox-SelectionBlock').element as HTMLElement
}

function translateOf(harness: VueWrapper): string {
  return blockOf(harness).style.getPropertyValue('translate')
}

/** The animation `element.animate()` hands back; jsdom has no Web Animations. */
function fakeAnimation(): Animation {
  return { cancel: vi.fn(), playState: 'running' } as unknown as Animation
}

let animate: ReturnType<typeof vi.fn>
let now = 1000

beforeEach(() => {
  layout.listWidth = 320
  gate.value = true
  now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  for (const [key, side] of [
    ['offsetLeft', 'left'],
    ['offsetTop', 'top'],
    ['offsetWidth', 'width'],
    ['offsetHeight', 'height']
  ] as const) {
    vi.spyOn(HTMLElement.prototype, key, 'get').mockImplementation(function (this: HTMLElement) {
      return layoutBoxOf(this)[side]
    })
  }
  animate = vi.fn(() => fakeAnimation())
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  document.body.replaceChildren()
})

describe('useSelectionBlock: placement', () => {
  it('covers the selected BoxItem, margins inset, and marks the list while it shows', async () => {
    const harness = await mountList({ rows: rows('a', 'b', 'c'), focus: 0 })
    const block = blockOf(harness)

    expect(listOf(harness).hasAttribute(SELECTION_BLOCK_ATTR)).toBe(true)
    expect(block.style.getPropertyValue('translate')).toBe('8px 4px')
    expect(block.style.getPropertyValue('width')).toBe('304px')
    expect(block.style.getPropertyValue('height')).toBe('44px')

    await harness.setProps({ focus: 2 })
    expect(translateOf(harness)).toBe('8px 108px')
  })

  it('writes the height only when the selected row is a different height', async () => {
    const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty')
    const harness = await mountList({
      rows: [{ id: 'a' }, { id: 'b' }, { id: 'c', height: 60 }, { id: 'd' }],
      focus: 0
    })
    const writesOf = (property: string): unknown[] =>
      setProperty.mock.calls.filter(([name]) => name === property).map(([, value]) => value)

    for (const focus of [1, 2, 3]) {
      now += 500
      await harness.setProps({ focus })
    }

    expect(writesOf('height')).toEqual(['44px', '60px', '44px'])
    expect(writesOf('width')).toEqual(['304px'])
    expect(writesOf('translate')).toEqual(['8px 4px', '8px 56px', '8px 108px', '8px 176px'])
  })
})

describe('useSelectionBlock: motion', () => {
  it('glides one row per step, and a step inside the previous one lands at once', async () => {
    const harness = await mountList({ rows: rows('a', 'b', 'c', 'd'), focus: 0 })

    await harness.setProps({ focus: 1 })
    expect(animate).toHaveBeenCalledTimes(1)
    expect(animate).toHaveBeenLastCalledWith(
      [{ transform: 'translate(0px, -52px)' }, { transform: 'translate(0px, 0px)' }],
      { duration: SELECTION_STEP_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
    )
    expect(translateOf(harness)).toBe('8px 56px')
    const firstStep = animate.mock.results[0]?.value as Animation

    // A held key: repeats arrive before the step before them would have finished.
    now += 30
    await harness.setProps({ focus: 2 })
    expect(animate).toHaveBeenCalledTimes(1)
    expect(firstStep.cancel).toHaveBeenCalledTimes(1)
    expect(translateOf(harness)).toBe('8px 108px')

    now += 30
    await harness.setProps({ focus: 3 })
    expect(animate).toHaveBeenCalledTimes(1)
    expect(translateOf(harness)).toBe('8px 160px')

    // Released: the next press glides again.
    now += 200
    await harness.setProps({ focus: 2 })
    expect(animate).toHaveBeenCalledTimes(2)
    expect(animate).toHaveBeenLastCalledWith(
      [{ transform: 'translate(0px, 52px)' }, { transform: 'translate(0px, 0px)' }],
      expect.objectContaining({ duration: SELECTION_STEP_MS })
    )
  })

  it('lands a step at once while a list FLIP is still carrying the block', async () => {
    const harness = await mountList({ rows: rows('a', 'b', 'c'), focus: 0 })
    const flip = fakeAnimation()
    blockOf(harness).getAnimations = () => [flip]

    now += 500
    await harness.setProps({ focus: 1 })

    expect(animate).not.toHaveBeenCalled()
    expect(flip.cancel).toHaveBeenCalledTimes(1)
    expect(translateOf(harness)).toBe('8px 56px')
  })

  it('lands every move when the motion gate is off, and on a jump of more than one row', async () => {
    const harness = await mountList({ rows: rows('a', 'b', 'c', 'd'), focus: 0 })

    gate.value = false
    await harness.setProps({ focus: 1 })
    expect(animate).not.toHaveBeenCalled()
    expect(translateOf(harness)).toBe('8px 56px')

    gate.value = true
    now += 500
    await harness.setProps({ focus: 3 })
    expect(animate).not.toHaveBeenCalled()
    expect(translateOf(harness)).toBe('8px 160px')
  })

  it('lands in place when the results change under it, even by one row', async () => {
    const harness = await mountList({ rows: rows('a', 'b', 'c'), focus: 0 })

    await harness.setProps({ rows: rows('x', 'a', 'b', 'c'), focus: 1 })

    expect(animate).not.toHaveBeenCalled()
    expect(translateOf(harness)).toBe('8px 56px')
  })
})

describe('useSelectionBlock: visibility', () => {
  it('hides for a custom row and for no selection, and shows again at once', async () => {
    const harness = await mountList({
      rows: [{ id: 'a' }, { id: 'widget', custom: true }, { id: 'c' }],
      focus: 0
    })
    const list = listOf(harness)
    expect(list.hasAttribute(SELECTION_BLOCK_ATTR)).toBe(true)

    now += 500
    await harness.setProps({ focus: 1 })
    expect(list.hasAttribute(SELECTION_BLOCK_ATTR)).toBe(false)

    // Off a hidden block there is nothing to glide from.
    now += 500
    await harness.setProps({ focus: 2 })
    expect(list.hasAttribute(SELECTION_BLOCK_ATTR)).toBe(true)
    expect(animate).not.toHaveBeenCalled()
    expect(translateOf(harness)).toBe(
      `8px ${ROW_HEIGHT + ROW_INSET_Y * 2 + CUSTOM_ROW_HEIGHT + 4}px`
    )

    await harness.setProps({ focus: -1 })
    expect(list.hasAttribute(SELECTION_BLOCK_ATTR)).toBe(false)
  })

  it('is gone in grid mode and lands on the selection when the list comes back', async () => {
    const harness = await mountList({ rows: rows('a', 'b', 'c'), focus: 1 })

    await harness.setProps({ grid: true })
    expect(harness.find('.CoreBox-SelectionBlock').exists()).toBe(false)

    await harness.setProps({ grid: false })
    await nextTick()
    const block = blockOf(harness)
    expect(listOf(harness).hasAttribute(SELECTION_BLOCK_ATTR)).toBe(true)
    // A new element: every property is written again, not only what changed.
    expect(block.style.getPropertyValue('translate')).toBe('8px 56px')
    expect(block.style.getPropertyValue('width')).toBe('304px')
    expect(block.style.getPropertyValue('height')).toBe('44px')
  })
})

describe('useSelectionBlock: resize', () => {
  let resize: (() => void) | null = null
  let observed: Element[] = []

  beforeEach(() => {
    resize = null
    observed = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback
        }

        observe(el: Element): void {
          observed.push(el)
        }

        disconnect(): void {
          observed = []
        }
      }
    )
  })

  it('re-measures when the list resizes, and leaves a step in flight alone when nothing moved', async () => {
    const harness = await mountList({ rows: rows('a', 'b', 'c'), focus: 0 })
    expect(observed).toEqual([listOf(harness)])

    await harness.setProps({ focus: 1 })
    const step = animate.mock.results[0]?.value as Animation
    const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty')

    resize?.()
    expect(setProperty).not.toHaveBeenCalled()
    expect(step.cancel).not.toHaveBeenCalled()

    // The preview pane opened and narrowed the list.
    layout.listWidth = 128
    resize?.()
    expect(blockOf(harness).style.getPropertyValue('width')).toBe('112px')
    expect(setProperty.mock.calls.map(([name]) => name)).toEqual(['width'])
  })
})

describe('useSelectionBlock: pointer idle', () => {
  function press(key: string): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  }

  function movePointer(screenX: number, screenY: number): void {
    document.dispatchEvent(new MouseEvent('mousemove', { screenX, screenY, bubbles: true }))
  }

  it('hides hover from a key press until the pointer really moves', async () => {
    const harness = await mountList({ rows: rows('a', 'b'), focus: 0 })
    const host = harness.element as HTMLElement
    const idle = (): boolean => host.hasAttribute(POINTER_IDLE_ATTR)

    press('ArrowDown')
    expect(idle()).toBe(true)

    movePointer(10, 10)
    expect(idle()).toBe(false)

    // A modifier alone is not a key step: ⌘-click is still the pointer's.
    press('Meta')
    expect(idle()).toBe(false)

    press('a')
    expect(idle()).toBe(true)
    // A move re-sent at the same spot (after a scroll) is not the pointer coming back.
    movePointer(10, 10)
    expect(idle()).toBe(true)
    movePointer(11, 10)
    expect(idle()).toBe(false)

    harness.unmount()
    wrapper = null
    press('ArrowDown')
    expect(idle()).toBe(false)
  })
})
