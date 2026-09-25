import type { FusionSurfaceBud } from '../src/types'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { fusionSurfacePath } from '../src/geometry'
import TxFusionSurface from '../src/TxFusionSurface.vue'

const W = 300
const H = 100

/** jsdom never paints: frames run only when the test steps them, on a clock
 *  it controls. */
function installFrames() {
  let id = 0
  let now = 0
  const queue = new Map<number, FrameRequestCallback>()
  const cancelled: number[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queue.set(++id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    cancelled.push(handle)
    queue.delete(handle)
  })
  const step = (ms = 1000 / 60): void => {
    now += ms
    const due = [...queue.values()]
    queue.clear()
    for (const callback of due)
      callback(now)
  }
  return {
    cancelled,
    pending: () => queue.size,
    step,
    /** Frames until the loop sleeps; throws if it never does. */
    run(limit = 2000): number {
      let count = 0
      while (queue.size) {
        if (++count > limit)
          throw new Error('the frame loop never went to sleep')
        step()
      }
      return count
    },
  }
}

let frames: ReturnType<typeof installFrames>
const originalMatchMedia = window.matchMedia

function stubReducedMotion(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: matches && query.includes('prefers-reduced-motion'),
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

beforeEach(() => {
  frames = installFrames()
  // jsdom lays nothing out; the root is the only element whose size matters.
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('tx-fusion-surface') ? W : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('tx-fusion-surface') ? H : 0
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: originalMatchMedia })
})

function mountSurface(buds: FusionSurfaceBud[], extra: Record<string, unknown> = {}) {
  return mount(TxFusionSurface, {
    props: { buds, ...extra },
    slots: {
      default: () => h('span', { class: 'body-content' }, 'Body'),
      bud: ({ bud }: { bud: FusionSurfaceBud }) => h('button', { class: 'bud-content', type: 'button' }, bud.id),
    },
  })
}

/** What the surface should show once every spring has landed. */
function settled(buds: Partial<FusionSurfaceBud & { height: number }>[], radius = 16): string {
  return fusionSurfacePath({
    width: W,
    height: H,
    radius,
    buds: buds.map(bud => ({ id: 'x', width: 0, height: 0, radius, fillet: 12, ...bud })),
  }).d
}

function pathOf(wrapper: ReturnType<typeof mountSurface>): string {
  return wrapper.find('path').attributes('d') ?? ''
}

function layer(wrapper: ReturnType<typeof mountSurface>, id: string) {
  return wrapper.find(`[data-bud="${id}"]`)
}

/** Centre and size of the drop, the path's second subpath, from its points
 *  and control points: a drop scaled about its centre scales this box too. */
function dropBox(wrapper: ReturnType<typeof mountSurface>): { x: number, y: number, width: number, height: number } | null {
  const drop = pathOf(wrapper).split(' M ')[1]
  if (!drop)
    return null
  const n = (drop.match(/-?\d*\.?\d+/g) ?? []).map(Number)
  const xs = n.filter((_, i) => i % 2 === 0)
  const ys = n.filter((_, i) => i % 2 === 1)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, width: x1 - x0, height: y1 - y0 }
}

/** Where the layer's centre lands: `translate(x, y) scale(s)` about its
 *  top-left corner, on a `width` × `height` layer. */
function layerCentre(el: HTMLElement, width: number, height: number): [number, number, number] {
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)(?: scale\(([\d.]+)\))?/.exec(el.style.transform)!
  const s = m[3] === undefined ? 1 : Number(m[3])
  return [Number(m[1]) + (width / 2) * s, Number(m[2]) + (height / 2) * s, s]
}

describe('txFusionSurface', () => {
  it('draws the body under its content with a silhouette hidden from assistive tech', () => {
    const wrapper = mountSurface([])

    const svg = wrapper.find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('focusable')).toBe('false')
    expect(wrapper.find('.body-content').text()).toBe('Body')
    // Drawn synchronously on mount, and nothing to animate.
    expect(pathOf(wrapper)).toBe(settled([]))
    expect(frames.pending()).toBe(0)
    wrapper.unmount()
  })

  it('grows a bud over several frames and settles on the target shape', async () => {
    const wrapper = mountSurface([{ id: 'a', width: 80, height: 30 }])
    // A new bud starts closed.
    expect(pathOf(wrapper)).toBe(settled([]))
    expect(frames.pending()).toBe(1)

    const seen = new Set<string>()
    for (let i = 0; i < 5; i++) {
      frames.step()
      seen.add(pathOf(wrapper))
    }
    // Every early frame is a different, still-growing shape.
    expect(seen.size).toBe(5)
    expect(seen.has(settled([{ height: 30, width: 80 }]))).toBe(false)

    frames.run()
    expect(pathOf(wrapper)).toBe(settled([{ height: 30, width: 80 }]))
    expect(wrapper.emitted('settle')).toHaveLength(1)
    expect(frames.pending()).toBe(0)

    // Retargeting wakes it again and lands on the new shape.
    await wrapper.setProps({ buds: [{ id: 'a', width: 120, height: 30, center: 100 }] })
    expect(frames.pending()).toBe(1)
    const before = pathOf(wrapper)
    frames.step()
    frames.step()
    expect(pathOf(wrapper)).not.toBe(before)
    frames.run()
    expect(pathOf(wrapper)).toBe(settled([{ height: 30, width: 120, center: 100 }]))
    expect(wrapper.emitted('settle')).toHaveLength(2)
    wrapper.unmount()
  })

  it('does not wake, or report a settle, when nothing has to move', async () => {
    const wrapper = mountSurface([{ id: 'a', width: 80, height: 30 }])
    frames.run()
    expect(wrapper.emitted('settle')).toHaveLength(1)

    await wrapper.setProps({ fill: 'red' })
    await wrapper.setProps({ buds: [{ id: 'a', width: 80, height: 30 }] })
    expect(frames.pending()).toBe(0)
    expect(wrapper.emitted('settle')).toHaveLength(1)
    wrapper.unmount()
  })

  it('jumps straight to the end state under reduced motion', async () => {
    stubReducedMotion(true)
    const wrapper = mountSurface([{ id: 'a', width: 80, height: 30 }])
    await nextTick()

    expect(frames.run()).toBe(1)
    expect(pathOf(wrapper)).toBe(settled([{ height: 30, width: 80 }]))

    // A pull past the break lands as two separate shapes in the same frame.
    await wrapper.setProps({ buds: [{ id: 'a', width: 80, height: 30, detach: 60 }] })
    expect(frames.run()).toBe(1)
    expect(wrapper.emitted('break')).toEqual([['a']])
    expect(pathOf(wrapper).match(/M /g)).toHaveLength(2)
    expect(wrapper.emitted('settle')).toHaveLength(2)
    wrapper.unmount()
  })

  it('cancels its pending frame when unmounted', () => {
    const wrapper = mountSurface([{ id: 'a', width: 80, height: 30 }])
    frames.step()
    expect(frames.pending()).toBe(1)

    wrapper.unmount()
    expect(frames.cancelled).toHaveLength(1)
    expect(frames.pending()).toBe(0)
  })

  it('emits break once when the neck snaps, then leaves body and drop apart', async () => {
    const wrapper = mountSurface([{ id: 'a', width: 80, height: 30 }])
    frames.run()

    await wrapper.setProps({ buds: [{ id: 'a', width: 80, height: 30, detach: 70 }] })
    frames.run()
    expect(wrapper.emitted('break')).toEqual([['a']])
    // Body and drop; the remnant has sunk back into the edge.
    const d = pathOf(wrapper)
    expect(d.match(/M /g)).toHaveLength(2)
    expect(d.startsWith(`${settled([])} M `)).toBe(true)

    // Latched: bringing the drop back does not re-fuse or break it again.
    await wrapper.setProps({ buds: [{ id: 'a', width: 80, height: 30, detach: 10 }] })
    frames.run()
    expect(wrapper.emitted('break')).toHaveLength(1)
    expect(pathOf(wrapper).match(/M /g)).toHaveLength(2)
    wrapper.unmount()
  })

  it('grows a fresh bud after a split one has closed', async () => {
    // Added already past the break: a drop from its first visible frame, with
    // no neck ever drawn and so no remnant springing out of the body.
    const wrapper = mountSurface([{ id: 'a', width: 80, height: 30, detach: 70 }])
    while (!wrapper.emitted('break'))
      frames.step()
    expect(pathOf(wrapper).startsWith(`${settled([])} M `)).toBe(true)
    frames.run()
    expect(wrapper.emitted('break')).toHaveLength(1)

    await wrapper.setProps({ buds: [{ id: 'a', width: 80, height: 30, open: false }] })
    frames.run()
    expect(pathOf(wrapper)).toBe(settled([]))

    await wrapper.setProps({ buds: [{ id: 'a', width: 80, height: 30 }] })
    frames.run()
    expect(pathOf(wrapper)).toBe(settled([{ height: 30, width: 80 }]))
    wrapper.unmount()
  })

  it('closes a drop toward its own centre, taking its content along', async () => {
    const bud: FusionSurfaceBud = { id: 'a', width: 80, height: 30, center: 100 }
    const wrapper = mountSurface([bud])
    frames.run()
    await wrapper.setProps({ buds: [{ ...bud, detach: 70 }] })
    frames.run()
    // The settled drop: 80 × 30, its inner end 70px above the edge.
    const rest = dropBox(wrapper)!
    expect(rest.x).toBeCloseTo(100, 1)
    expect(rest.y).toBeCloseTo(-85, 1)
    expect(rest.width / rest.height).toBeCloseTo(80 / 30, 2)
    const el = layer(wrapper, 'a').element as HTMLElement

    // Closing it keeps its middle and its proportions all the way down; it
    // used to keep its width and flatten into a line at its inner end.
    const shrink = async (open: boolean): Promise<number> => {
      await wrapper.setProps({ buds: [{ ...bud, detach: 70, open }] })
      let seen = 0
      let last = open ? 0 : rest.width
      while (frames.pending()) {
        frames.step()
        const box = dropBox(wrapper)
        if (!box)
          continue
        seen += 1
        expect(box.x).toBeCloseTo(100, 1)
        expect(box.y).toBeCloseTo(-85, 1)
        expect(Math.abs(box.width / box.height - 80 / 30), `${box.width} × ${box.height}`).toBeLessThan(0.05)
        expect(open ? box.width >= last - 0.02 : box.width <= last + 0.02).toBe(true)
        last = box.width
        // The content scales with the drop, about the same centre.
        const [x, y, s] = layerCentre(el, 80, 30)
        expect(x).toBeCloseTo(100, 1)
        expect(y).toBeCloseTo(-85, 1)
        expect(Math.abs(s - box.width / 80)).toBeLessThan(0.01)
      }
      return seen
    }
    expect(await shrink(false)).toBeGreaterThan(5)
    expect(pathOf(wrapper)).toBe(settled([]))

    // Opened again this far out, it is a drop from its first frame and grows
    // from that same centre.
    expect(await shrink(true)).toBeGreaterThan(5)
    expect(wrapper.emitted('break')).toHaveLength(2)
    expect(dropBox(wrapper)).toEqual(rest)
    expect(el.style.transform).toBe('translate(60px, -100px)')
    wrapper.unmount()
  })

  it('keeps a closed bud\'s content inert', async () => {
    const wrapper = mountSurface([
      { id: 'a', width: 80, height: 30, open: false },
      { id: 'b', width: 60, height: 20, edge: 'bottom' },
    ])
    expect(layer(wrapper, 'a').attributes('inert')).toBeDefined()
    expect(layer(wrapper, 'b').attributes('inert')).toBeUndefined()

    await wrapper.setProps({ buds: [{ id: 'a', width: 80, height: 30 }, { id: 'b', width: 60, height: 20, edge: 'bottom', open: 0 }] })
    expect(layer(wrapper, 'a').attributes('inert')).toBeUndefined()
    expect(layer(wrapper, 'b').attributes('inert')).toBeDefined()
    wrapper.unmount()
  })

  it('places and fades the content from the frame loop, out of Vue\'s reach', async () => {
    const wrapper = mountSurface([{ id: 'a', width: 80, height: 30, center: 100 }])
    const el = layer(wrapper, 'a').element as HTMLElement
    expect(el.style.width).toBe('80px')
    expect(el.style.height).toBe('30px')

    // Hidden and blurred while the bud is too small to hold it.
    frames.step()
    expect(el.style.opacity).toBe('0')
    expect(el.style.filter).toBe('blur(6px)')

    frames.run()
    expect(el.style.opacity).toBe('1')
    expect(el.style.filter).toBe('none')
    // Outer edge on the bud's outer edge, centred along it.
    expect(el.style.transform).toBe('translate(60px, -30px)')
    expect(el.style.getPropertyValue('--tx-fusion-surface-progress')).toBe('1')

    // A re-render must not reset what the loop wrote; it is asleep now.
    await wrapper.setProps({ stroke: 'blue' })
    expect(el.style.opacity).toBe('1')
    expect(el.style.transform).toBe('translate(60px, -30px)')
    wrapper.unmount()
  })

  it('writes a layer that mounts while the loop is asleep', async () => {
    // The `bud` slot arrives after every spring has landed: no frame is coming,
    // so the new layer has to be placed and shown when it mounts.
    const withSlot = ref(false)
    const Host = defineComponent({
      setup: () => () => h(
        TxFusionSurface,
        { buds: [{ id: 'a', width: 80, height: 30, center: 100 }] },
        withSlot.value ? { bud: () => h('span', 'late') } : {},
      ),
    })
    const wrapper = mount(Host)
    frames.run()
    expect(wrapper.find('[data-bud="a"]').exists()).toBe(false)

    withSlot.value = true
    await nextTick()
    const el = wrapper.find('[data-bud="a"]').element as HTMLElement
    expect(frames.pending()).toBe(0)
    expect(el.style.opacity).toBe('1')
    expect(el.style.transform).toBe('translate(60px, -30px)')
    wrapper.unmount()
  })

  it('closes a removed bud before dropping its content', async () => {
    const wrapper = mountSurface([{ id: 'a', width: 80, height: 30 }])
    frames.run()

    await wrapper.setProps({ buds: [] })
    // Still there, closing, and no longer reachable.
    expect(layer(wrapper, 'a').exists()).toBe(true)
    expect(layer(wrapper, 'a').attributes('inert')).toBeDefined()

    frames.run()
    await nextTick()
    expect(layer(wrapper, 'a').exists()).toBe(false)
    expect(pathOf(wrapper)).toBe(settled([]))
    wrapper.unmount()
  })

  it('renders a repeated id once, as the first declaration', () => {
    // The driver already ignored a repeat; the template keyed both layers on
    // one id, which Vue reports and can patch into the wrong element.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mountSurface([
      { id: 'a', width: 80, height: 30, open: false },
      { id: 'a', width: 60, height: 20 },
    ])
    expect(wrapper.findAll('[data-bud="a"]')).toHaveLength(1)
    expect(layer(wrapper, 'a').attributes('inert')).toBeDefined()
    expect((layer(wrapper, 'a').element as HTMLElement).style.width).toBe('80px')
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/duplicate keys/i)
    wrapper.unmount()
  })

  it('maps fill, stroke and shadow onto the silhouette\'s custom properties', async () => {
    const wrapper = mountSurface([])
    // Unset: the stylesheet's token defaults apply.
    expect(wrapper.attributes('style')).toBeUndefined()

    await wrapper.setProps({
      fill: 'var(--tx-fill-color-light)',
      stroke: 'var(--tx-border-color)',
      strokeWidth: 1.5,
      shadow: '1px 4px 8px rgba(0,0,0,.2), inset 0 0 0 1px red, 0 0 0 2px blue',
    })
    const style = wrapper.attributes('style')!
    expect(style).toContain('--tx-fusion-surface-fill: var(--tx-fill-color-light)')
    expect(style).toContain('--tx-fusion-surface-stroke: var(--tx-border-color)')
    expect(style).toContain('--tx-fusion-surface-stroke-width: 1.5px')
    // drop-shadow() has no inset and no spread: those two layers are dropped.
    expect(style).toContain('--tx-fusion-surface-filter: drop-shadow(1px 4px 8px rgba(0,0,0,.2));')

    await wrapper.setProps({ shadow: 'var(--tx-elevation-4)' })
    expect(wrapper.attributes('style')).toContain('--tx-fusion-surface-filter: drop-shadow(var(--tx-elevation-4))')
    await wrapper.setProps({ shadow: 'none' })
    expect(wrapper.attributes('style')).toContain('--tx-fusion-surface-filter: none')
    wrapper.unmount()
  })
})
