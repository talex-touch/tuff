// @vitest-environment jsdom
/**
 * The mode menu's travelling highlight, frame by frame. A fake animation-frame clock steps the real
 * indicator engine (`useJellyIndicator`, glide material), and the rows report laid-out rects, which
 * jsdom has none of: each plate row is 32px tall, 1px apart, in the order the panel renders them.
 * TxDropdownMenu is the same in-place stub as `HomeWorkspaceModeMenu.test.ts`.
 */
import type { AiAgentProfile } from '@talex-touch/utils/types/ai-orchestrator'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HomeWorkspaceModeMenu from './HomeWorkspaceModeMenu.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

vi.mock('@talex-touch/tuffex/dropdown-menu', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    TxDropdownMenu: defineComponent({
      name: 'TxDropdownMenu',
      props: { modelValue: { type: Boolean, default: false } },
      emits: ['update:modelValue'],
      setup(props, { slots, emit }) {
        return () =>
          h('div', { class: 'dropdown-stub' }, [
            h(
              'div',
              {
                class: 'dropdown-stub__trigger',
                onClick: () => emit('update:modelValue', !props.modelValue)
              },
              slots.trigger?.()
            ),
            props.modelValue
              ? h('div', { class: 'dropdown-stub__panel', role: 'menu' }, slots.default?.())
              : null
          ])
      }
    })
  }
})

const ROW = 32
const PITCH = ROW + 1
const WIDTH = 260

function profile(id: string, name: string, enabled = true): AiAgentProfile {
  return {
    id,
    name,
    enabled,
    runtimeProvider: 'pi-core',
    allowedToolIds: [],
    permissionPolicy: { mode: 'manual' }
  } as unknown as AiAgentProfile
}

const COORDINATOR = profile('tuff-pi', 'Tuff Pi Coordinator')

// --- a frame clock the engine and the menu's own frame callbacks run on ---------------------------
let frames = new Map<number, FrameRequestCallback>()
let nextFrameId = 1
let clock = 0

function step(): void {
  clock += 1000 / 60
  const due = frames
  frames = new Map()
  for (const callback of due.values()) callback(clock)
}

// --- layout: the panel at the origin, its plate rows stacked by render order ------------------------
const originalRect = HTMLElement.prototype.getBoundingClientRect

function rect(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    left: 0,
    right: WIDTH,
    bottom: top + height,
    width: WIDTH,
    height,
    toJSON: () => ({})
  } as DOMRect
}

beforeEach(() => {
  frames = new Map()
  clock = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrameId++
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id)
  })
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
    if (this.classList.contains('HomeWorkspaceModeMenu')) return rect(0, 200)
    if (this.dataset.plateKey !== undefined) {
      const rows = Array.from(
        this.closest('.HomeWorkspaceModeMenu')?.querySelectorAll<HTMLElement>('[data-plate-key]') ??
          []
      )
      return rect(rows.indexOf(this) * PITCH, ROW)
    }
    return originalRect.call(this)
  }
})

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  HTMLElement.prototype.getBoundingClientRect = originalRect
  vi.unstubAllGlobals()
  // @ts-expect-error jsdom ships no matchMedia; a test that installs one removes it again.
  delete window.matchMedia
})

async function settleDom(): Promise<void> {
  await nextTick()
  await nextTick()
}

async function openMenu(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  wrapper = mount(HomeWorkspaceModeMenu, {
    props: {
      mode: 'chat',
      profileId: undefined,
      profiles: [COORDINATOR],
      profilesLoading: false,
      profilesError: false,
      profileSaving: null,
      branchOnChange: false,
      locked: false,
      ...props
    },
    attachTo: document.body
  })
  await wrapper.get('.ComposerChip').trigger('click')
  await settleDom()
  return wrapper
}

function plate(menu: VueWrapper): HTMLElement {
  return menu.get('.HomeWorkspaceModeMenu-Plate').element as HTMLElement
}

/** The plate's top edge, read from the transform the engine writes. */
function plateTop(menu: VueWrapper): number {
  const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(plate(menu).style.transform)
  return match ? Number(match[2]) : Number.NaN
}

function row(menu: VueWrapper, key: string): HTMLElement {
  return menu.get(`[data-plate-key="${key}"]`).element as HTMLElement
}

/** Steps frames until the plate stops moving; returns the top edge seen on every frame. */
function runTrip(menu: VueWrapper, limit = 90): number[] {
  const tops: number[] = []
  for (let index = 0; index < limit; index++) {
    step()
    tops.push(plateTop(menu))
    if (frames.size === 0) break
  }
  return tops
}

describe('HomeWorkspaceModeMenu travelling plate', () => {
  it('lands on the current choice when the menu opens, without travelling there', async () => {
    const menu = await openMenu({ mode: 'agent', profileId: 'tuff-pi' })

    // Before a single frame runs: already on 「Tuff Pi Coordinator」, the second row, full height.
    expect(plateTop(menu)).toBe(PITCH)
    expect(plate(menu).style.height).toBe(`${ROW}px`)
    expect(plate(menu).style.width).toBe(`${WIDTH}px`)
    expect(plate(menu).style.opacity).toBe('1')
    expect(menu.get('.HomeWorkspaceModeMenu').classes()).toContain('has-plate')
  })

  it('travels to the row under the pointer frame by frame, and home again when it leaves', async () => {
    const menu = await openMenu()
    expect(plateTop(menu)).toBe(0)

    // 「管理智能体」 is the third row.
    row(menu, 'manage').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await settleDom()
    const out = runTrip(menu)
    expect(out.at(-1)).toBe(2 * PITCH)
    // A trip, not a jump: frames in between, each one further along.
    const between = out.filter((top) => top > 0 && top < 2 * PITCH)
    expect(between.length).toBeGreaterThan(3)
    for (let index = 1; index < between.length; index++) {
      expect(between[index]!).toBeGreaterThanOrEqual(between[index - 1]!)
    }
    expect(plate(menu).style.height).toBe(`${ROW}px`)

    menu.get('.HomeWorkspaceModeMenu').element.dispatchEvent(new MouseEvent('mouseleave'))
    await settleDom()
    const back = runTrip(menu)
    expect(back.at(-1)).toBe(0)
    expect(back.filter((top) => top > 0 && top < 2 * PITCH).length).toBeGreaterThan(3)
  })

  it('follows keyboard focus from row to row', async () => {
    const menu = await openMenu()
    runTrip(menu)

    // Focus leaving 「对话」 for the next row: focusout names where it goes, then focusin arrives.
    const chat = row(menu, 'chat')
    const coordinator = row(menu, 'profile:tuff-pi')
    chat.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: coordinator }))
    coordinator.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await settleDom()
    const tops = runTrip(menu)
    expect(tops.at(-1)).toBe(PITCH)
    expect(tops.filter((top) => top > 0 && top < PITCH).length).toBeGreaterThan(3)
  })

  it('never lands on a locked row', async () => {
    // Mid-turn, a pick that changes the mode is locked: the profile row is aria-disabled.
    const menu = await openMenu({ locked: true })
    expect(row(menu, 'profile:tuff-pi').getAttribute('aria-disabled')).toBe('true')

    row(menu, 'profile:tuff-pi').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await settleDom()
    runTrip(menu)
    expect(plateTop(menu)).toBe(0)

    // Positive control: an unlocked row under the pointer does draw it.
    row(menu, 'manage').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await settleDom()
    expect(runTrip(menu).at(-1)).toBe(2 * PITCH)
  })

  it('lands at once under reduced motion', async () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    })) as unknown as typeof window.matchMedia
    const menu = await openMenu()

    row(menu, 'manage').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await settleDom()
    // No frame has run, and the plate is already there.
    expect(plateTop(menu)).toBe(2 * PITCH)
  })

  it('measures the manage view afresh instead of staying on the row that opened it', async () => {
    const menu = await openMenu()
    row(menu, 'manage').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await settleDom()
    runTrip(menu)
    expect(plateTop(menu)).toBe(2 * PITCH)

    await menu.get('[data-plate-key="manage"]').trigger('click')
    await settleDom()
    // Focus moves to the back row, the first control of the new view; the plate lands there, in
    // place — there is nothing in this list to travel from.
    expect(document.activeElement).toBe(row(menu, 'back'))
    expect(plateTop(menu)).toBe(0)
    expect(plate(menu).style.opacity).toBe('1')
  })

  it('lands back on the current choice when the main list returns, and stays there', async () => {
    const menu = await openMenu({ mode: 'agent', profileId: 'tuff-pi' })
    await menu.get('[data-plate-key="manage"]').trigger('click')
    await settleDom()
    expect(plateTop(menu)).toBe(0)

    // The back row sits where 「对话」 will: going home is a landing on 「Tuff Pi Coordinator」, the
    // second row, with focus there too — not a slide down to it, nor a pull back up to row one.
    await menu.get('[data-plate-key="back"]').trigger('click')
    await settleDom()
    expect(document.activeElement).toBe(row(menu, 'profile:tuff-pi'))
    expect(plateTop(menu)).toBe(PITCH)
    expect(runTrip(menu).every((top) => top === PITCH)).toBe(true)
  })
})
