import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as engine from '../src/engine'
import {
  ease,
  imageGenerationCreateInstance,
  imageGenerationDestroyInstance,
  imageGenerationHexToRgb,
  imageGenerationPresets,
  parseCssColor,
} from '../index'
// `PRESETS` / `hexToRgb` are not exported under their bare upstream names from
// the star barrel (they collide with `metal-fx`), so the tests read them from
// the module that owns them; the index aliases are asserted against these.
import { hexToRgb, PRESETS } from '../src/presets'
import TxImageGeneration from '../src/TxImageGeneration.vue'
import type { ImageGenerationHandle, ImageGenerationPreset } from '../src/types'

// jsdom has no WebGL and `three` is an optional peer dependency that is not
// installed in this workspace. The `three` surface `renderer.ts` touches is
// stubbed here: the fake renderer never talks to a GPU, but it still lets the
// real engine code (uniform upload, cell math, reveal plumbing) run.
interface FakeUniformBag {
  [key: string]: { value: unknown }
}
interface FakeMaterial {
  uniforms: FakeUniformBag
  vertexShader: string
  fragmentShader: string
  needsUpdate: boolean
  dispose: () => void
}
interface FakeRenderer {
  domElement: HTMLCanvasElement | undefined
  autoClear: boolean
}

const three = vi.hoisted(() => {
  const state = { materials: [] as FakeMaterial[], renderers: [] as FakeRenderer[] }
  class Vector2 {
    x = 1
    y = 1
    set(x: number, y: number) {
      this.x = x
      this.y = y
      return this
    }
  }
  class Vector3 {
    x = 0
    y = 0
    z = 0
    set(x: number, y: number, z: number) {
      this.x = x
      this.y = y
      this.z = z
      return this
    }
  }
  class Color {
    r = 0
    g = 0
    b = 0
    constructor(color?: number | string) {
      void color
    }

    set(color: number | string) {
      void color
      return this
    }

    setRGB(r: number, g: number, b: number) {
      this.r = r
      this.g = g
      this.b = b
      return this
    }
  }
  class Scene {
    add() {
      return this
    }
  }
  class OrthographicCamera {
    position = new Vector3()
    updateProjectionMatrix() {}
  }
  class PlaneGeometry {
    dispose() {}
  }
  class ShaderMaterial {
    uniforms: FakeUniformBag
    vertexShader: string
    fragmentShader: string
    needsUpdate = false
    constructor(params?: { uniforms?: FakeUniformBag, vertexShader?: string, fragmentShader?: string }) {
      this.uniforms = params?.uniforms ?? {}
      this.vertexShader = params?.vertexShader ?? ''
      this.fragmentShader = params?.fragmentShader ?? ''
      state.materials.push(this)
    }

    dispose() {}
  }
  class Mesh {}
  class WebGLRenderer {
    domElement: HTMLCanvasElement | undefined
    autoClear = false
    constructor(params?: { canvas?: HTMLCanvasElement }) {
      this.domElement = params?.canvas
      state.renderers.push(this)
    }

    setPixelRatio() {}
    getPixelRatio() {
      return 1
    }

    setClearColor() {}
    setSize() {}
    setViewport() {}
    setScissor() {}
    setScissorTest() {}
    getContext() {
      return {}
    }

    render() {}
    dispose() {}
  }
  return {
    state,
    Vector2,
    Vector3,
    Color,
    Scene,
    OrthographicCamera,
    PlaneGeometry,
    ShaderMaterial,
    Mesh,
    WebGLRenderer,
    NormalBlending: 1,
  }
})

vi.mock('three', () => three)

const PRESET_NAMES: ImageGenerationPreset[] = ['pixels-organic', 'pixels-mechanic', 'sweep-gradient']

/** Partial 2D context — stands in for the calls the engine actually makes. */
function create2dStub(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const stub = {
    // The reveal/cycle code drives `ctx.canvas.style` and resizes
    // `ctx.canvas`, so the stub has to own the real canvas element.
    canvas,
    imageSmoothingEnabled: false,
    fillStyle: '#000000',
    clearRect() {},
    drawImage() {},
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    fill() {},
    getImageData: () => ({ data: new Uint8ClampedArray(24 * 24 * 4).fill(255) }),
    putImageData() {},
    createPattern: () => ({}),
    setTransform() {},
  }
  // The component only needs the members above; the cast keeps the real
  // CanvasRenderingContext2D shape at the call sites.
  return stub as unknown as CanvasRenderingContext2D
}

/** Records resize callbacks so a test can drive a resize on demand. */
let resizeCallbacks: ResizeObserverCallback[] = []
class ResizeObserverStub {
  #cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) {
    this.#cb = cb
  }

  observe() {
    resizeCallbacks.push(this.#cb)
  }

  unobserve() {}
  disconnect() {
    resizeCallbacks = resizeCallbacks.filter(cb => cb !== this.#cb)
  }
}

/** Records intersection callbacks so a test can drive visibility. */
let intersectionCallbacks: IntersectionObserverCallback[] = []
class IntersectionObserverStub {
  #cb: IntersectionObserverCallback
  constructor(cb: IntersectionObserverCallback) {
    this.#cb = cb
  }

  observe() {
    intersectionCallbacks.push(this.#cb)
  }

  unobserve() {}
  disconnect() {
    intersectionCallbacks = intersectionCallbacks.filter(cb => cb !== this.#cb)
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

/** Mutable host geometry the component measures through the DOM. */
const geometry = { width: 240, height: 160, childRadius: '8px', rootRadius: '5px' }

// A failed assertion must never leak a live engine instance into the next test
// (the engine keeps one shared WebGL renderer per page).
enableAutoUnmount(afterEach)

function rectOf(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    toJSON: () => ({ width, height }),
  } as DOMRect
}

beforeEach(() => {
  geometry.width = 240
  geometry.height = 160
  geometry.childRadius = '8px'
  geometry.rootRadius = '5px'
  resizeCallbacks = []
  intersectionCallbacks = []
  three.state.materials = []
  three.state.renderers = []

  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, type: string) {
    return type === '2d' ? create2dStub(this) : {}
  } as unknown as typeof HTMLCanvasElement.prototype.getContext)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((((el: Element) => ({
    // The host card is the slot child; everything else reports the wrapper
    // radius so the child→wrapper fallback chain can be exercised.
    borderTopLeftRadius: (el as HTMLElement).classList?.contains('card') ? geometry.childRadius : geometry.rootRadius,
    colorScheme: '',
  }))) as unknown as typeof window.getComputedStyle)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement): DOMRect {
    return this.classList?.contains('image-gen-root')
      ? rectOf(geometry.width, geometry.height)
      : rectOf(0, 0)
  })

  vi.spyOn(engine, 'createInstance')
  vi.spyOn(engine, 'createCycle')
  vi.spyOn(engine, 'createReveal')
  vi.spyOn(engine, 'destroyInstance')
  vi.spyOn(engine, 'renderInstanceOnce')
  vi.spyOn(engine, 'samplePaletteFromCanvas')
  vi.spyOn(engine, 'setInstanceCardBg')
  vi.spyOn(engine, 'setInstanceColors')
  vi.spyOn(engine, 'setInstancePaused')
  vi.spyOn(engine, 'setInstancePixelScale')
  vi.spyOn(engine, 'setInstancePreset')
  vi.spyOn(engine, 'setInstanceSpeed')
  vi.spyOn(engine, 'setInstanceStrength')
  vi.spyOn(engine, 'setInstanceVisible')
  vi.spyOn(engine, 'setSharedFragmentShader')
  vi.spyOn(engine, 'updateInstanceSize')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.classList.remove('dark', 'light')
})

/** Mount with a slot child that plays the role of the host card. */
function mountCard(props: Record<string, unknown> = {}) {
  return mount(TxImageGeneration, {
    props,
    slots: { default: '<div class="card">host card</div>' },
  })
}

const createInstanceSpy = () => vi.mocked(engine.createInstance)
const createCycleSpy = () => vi.mocked(engine.createCycle)

function handleOf(wrapper: { vm: unknown }): ImageGenerationHandle {
  // `defineExpose` is what consumers reach through a template ref.
  return wrapper.vm as unknown as ImageGenerationHandle
}

function cycleOf() {
  return createCycleSpy().mock.results[0]!.value
}

function instanceOf() {
  return createInstanceSpy().mock.results[0]!.value
}

async function flushResize(): Promise<void> {
  for (const cb of [...resizeCallbacks])
    cb([], {} as ResizeObserver)
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

describe('bundled presets', () => {
  it('ships a dark and a light tuning with a 7-slot palette for every preset', () => {
    for (const name of PRESET_NAMES) {
      const preset = PRESETS[name]
      expect(preset, name).toBeTruthy()
      for (const theme of ['dark', 'light'] as const) {
        const mode = preset.modes[theme]
        expect(mode, `${name}/${theme}`).toBeTruthy()
        expect(mode.colors).toHaveLength(7)
        expect(mode.cardBg).toMatch(/^#[0-9a-f]{6}$/i)
        expect(Number.isFinite(mode.effectIndex)).toBe(true)
        expect(mode.pixelConfig.cellSize).toBeGreaterThan(0)
      }
      // The two tunings must actually differ, otherwise the theme switch is inert.
      expect(preset.modes.dark.cardBg).not.toBe(preset.modes.light.cardBg)
    }
  })

  it('parses hex shorthand and rejects unparseable colours to black', () => {
    expect(hexToRgb('#abc')).toEqual([0xaa / 255, 0xbb / 255, 0xcc / 255])
    expect(parseCssColor('#ffffff')).toEqual([1, 1, 1])
    expect(parseCssColor('not-a-colour')).toEqual([0, 0, 0])
    expect(parseCssColor('')).toEqual([0, 0, 0])
  })

  it('falls back to smoothstep for an unknown easing key and clamps its input', () => {
    expect(ease('bogus' as never, 0.25)).toBeCloseTo(0.25 * 0.25 * (3 - 2 * 0.25), 6)
    expect(ease('linear', 4)).toBe(1)
    expect(ease('linear', -4)).toBe(0)
  })

  it('re-exports the generic power-user names under collision-free aliases', () => {
    // The star barrel is an `export *` aggregate, where a name exported by two
    // components is dropped. These aliases are the entry points that survive it.
    expect(imageGenerationPresets).toBe(PRESETS)
    expect(imageGenerationHexToRgb).toBe(hexToRgb)
    expect(imageGenerationCreateInstance).toBe(engine.createInstance)
    expect(imageGenerationDestroyInstance).toBe(engine.destroyInstance)
  })
})

describe('txImageGeneration wrapper', () => {
  it('renders the wrapper, both canvases and the slot child', () => {
    const wrapper = mountCard({ preset: 'pixels-mechanic', theme: 'dark' })
    const root = wrapper.element as HTMLElement

    expect(root.classList.contains('image-gen-root')).toBe(true)
    expect(root.dataset.preset).toBe('pixels-mechanic')
    expect(root.dataset.theme).toBe('dark')
    expect(root.dataset.paused).toBeUndefined()

    const canvases = root.querySelectorAll('canvas')
    expect(canvases).toHaveLength(2)
    for (const canvas of Array.from(canvases))
      expect(canvas.getAttribute('aria-hidden')).toBe('true')

    expect(root.querySelector('.image-gen-child .card')?.textContent).toBe('host card')
    wrapper.unmount()
  })

  it('forwards attrs to the wrapper and merges class/style with its own', () => {
    const wrapper = mount(TxImageGeneration, {
      props: { theme: 'dark' },
      attrs: {
        class: 'my-card',
        style: 'border-radius: 999px; color: rgb(4, 5, 6)',
        role: 'img',
        'aria-label': 'Generating image',
        'aria-busy': 'true',
      },
      slots: { default: '<div class="card" />' },
    })
    const root = wrapper.element as HTMLElement

    expect(root.classList.contains('image-gen-root')).toBe(true)
    expect(root.classList.contains('my-card')).toBe(true)
    expect(root.getAttribute('role')).toBe('img')
    expect(root.getAttribute('aria-label')).toBe('Generating image')
    expect(root.getAttribute('aria-busy')).toBe('true')
    // The computed card background merges in and the consumer's unrelated
    // declarations survive. jsdom canonicalises colours, so compare through a
    // throwaway element to stay independent of its normalisation.
    const probe = document.createElement('div')
    probe.style.background = PRESETS['pixels-organic'].modes.dark.cardBg
    expect(root.style.background).toBe(probe.style.background)
    expect(root.style.color).toBe('rgb(4, 5, 6)')
    // The radius always follows the measured child; pass `borderRadius` to pin
    // it explicitly (the React original overrides the inline style the same way).
    expect(root.style.borderRadius).toBe('8px')
    wrapper.unmount()
  })

  it('honours an explicit theme prop and follows <html data-theme> live', async () => {
    const pinned = mountCard({ theme: 'dark' })
    expect((pinned.element as HTMLElement).dataset.theme).toBe('dark')
    pinned.unmount()

    const light = mountCard({ theme: 'light' })
    expect((light.element as HTMLElement).dataset.theme).toBe('light')
    light.unmount()

    // `auto` falls back to the OS preference (jsdom reports no preference).
    document.documentElement.setAttribute('data-theme', 'dark')
    const auto = mountCard()
    expect((auto.element as HTMLElement).dataset.theme).toBe('dark')
    // …and the html observer re-resolves without a remount.
    document.documentElement.setAttribute('data-theme', 'light')
    await vi.waitFor(() => {
      expect((auto.element as HTMLElement).dataset.theme).toBe('light')
    })
    auto.unmount()
  })
})

describe('image pool normalisation', () => {
  it('normalises a single string, an array and a missing pool', () => {
    const single = mountCard({ images: 'a.png' })
    expect(createCycleSpy().mock.calls[0]![0].images).toEqual(['a.png'])
    single.unmount()

    const many = mountCard({ images: ['a.png', 'b.png'] })
    expect(createCycleSpy().mock.calls[1]![0].images).toEqual(['a.png', 'b.png'])
    many.unmount()

    const none = mountCard()
    expect(createCycleSpy().mock.calls[2]![0].images).toEqual([])
    none.unmount()
  })

  it('copies the caller\'s array and pushes later prop changes into the cycle', async () => {
    const pool = ['a.png']
    const wrapper = mountCard({ images: pool })
    expect(createCycleSpy().mock.calls[0]![0].images).not.toBe(pool)

    const setImages = vi.spyOn(cycleOf(), 'setImages')
    await wrapper.setProps({ images: ['c.png', 'd.png'] })
    expect(setImages).toHaveBeenCalledTimes(1)
    expect(setImages).toHaveBeenCalledWith(['c.png', 'd.png'])
    wrapper.unmount()
  })

  it('leaves the cycle quiet for an empty pool', () => {
    const wrapper = mountCard()
    const cycle = cycleOf()
    const triggerOnce = vi.spyOn(cycle, 'triggerOnce')

    handleOf(wrapper).triggerReveal()

    // The handle delegates to the cycle unconditionally…
    expect(triggerOnce).toHaveBeenCalledTimes(1)
    // …and the cycle itself no-ops: nothing is revealed, nothing is emitted.
    expect(cycle.getPhase()).toBe('idle')
    expect(handleOf(wrapper).isImageActive()).toBe(false)
    expect(wrapper.emitted('cycle')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('imperative handle', () => {
  it('exposes the wrapper element and reports the active phase', () => {
    const wrapper = mountCard({ images: ['a.png'] })
    const cycle = cycleOf()
    const handle = handleOf(wrapper)

    expect(handle.element).toBe(wrapper.element)
    expect(handle.isImageActive()).toBe(false)

    const phase = vi.spyOn(cycle, 'getPhase').mockReturnValue('visible')
    expect(handle.isImageActive()).toBe(true)
    phase.mockReturnValue('hide')
    expect(handle.isImageActive()).toBe(true)
    phase.mockReturnValue('idle')
    expect(handle.isImageActive()).toBe(false)
    wrapper.unmount()
  })

  it('forwards reveal/hide calls to the cycle', () => {
    const wrapper = mountCard({ images: ['a.png'] })
    const cycle = cycleOf()
    const handle = handleOf(wrapper)

    const triggerOnce = vi.spyOn(cycle, 'triggerOnce')
    handle.triggerReveal({ hold: 'manual' })
    expect(triggerOnce).toHaveBeenCalledWith({ hold: 'manual' })

    const triggerHide = vi.spyOn(cycle, 'triggerHide')
    handle.triggerHide()
    expect(triggerHide).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('emits every cycle phase to the consumer', () => {
    const wrapper = mountCard({ images: ['a.png'] })
    const opts = createCycleSpy().mock.calls[0]![0]
    opts.onPhase({ phase: 'reveal', src: 'a.png' })
    opts.onPhase({ phase: 'visible', src: 'a.png' })

    expect(wrapper.emitted('cycle')?.[0]).toEqual([{ phase: 'reveal', src: 'a.png' }])
    expect(wrapper.emitted('cycle')?.[1]).toEqual([{ phase: 'visible', src: 'a.png' }])
    wrapper.unmount()
  })

  it('does not churn while no image is revealed or while paused', () => {
    const idle = mountCard({ images: ['a.png'], preset: 'sweep-gradient' })
    const idleCycle = cycleOf()
    const idleBoil = vi.spyOn(idleCycle, 'triggerBoil')
    handleOf(idle).triggerRegenerate()
    expect(idleCycle.getPhase()).toBe('idle')
    expect(idleBoil).not.toHaveBeenCalled()
    idle.unmount()

    const paused = mountCard({ images: ['a.png'], preset: 'sweep-gradient', paused: true })
    const pausedCycle = cycleOf()
    vi.spyOn(pausedCycle, 'getPhase').mockReturnValue('visible')
    const pausedBoil = vi.spyOn(pausedCycle, 'triggerBoil')
    handleOf(paused).triggerRegenerate()
    expect(pausedBoil).not.toHaveBeenCalled()
    paused.unmount()
  })

  it('runs the churn with the documented defaults while an image is revealed', () => {
    const wrapper = mountCard({ images: ['a.png'], preset: 'pixels-organic' })
    const cycle = cycleOf()
    vi.spyOn(cycle, 'getPhase').mockReturnValue('visible')
    const boil = vi.spyOn(cycle, 'triggerBoil')
    const handle = handleOf(wrapper)

    handle.triggerRegenerate()
    expect(boil).toHaveBeenLastCalledWith({ autoRevealAfterMs: 4000 })
    expect(engine.samplePaletteFromCanvas).toHaveBeenCalledTimes(1)

    handle.triggerRegenerate({ durationMs: 1500 })
    expect(boil).toHaveBeenLastCalledWith({ autoRevealAfterMs: 1500 })

    handle.triggerRegenerate({ autoReveal: false })
    expect(boil).toHaveBeenLastCalledWith(undefined)

    vi.mocked(engine.samplePaletteFromCanvas).mockClear()
    handle.triggerRegenerate({ tintFromImage: false })
    expect(engine.samplePaletteFromCanvas).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('swaps in a pixel preset for the churn and tints from the outgoing image', async () => {
    const wrapper = mountCard({ images: ['a.png'], preset: 'sweep-gradient', theme: 'dark' })
    const cycle = cycleOf()
    vi.spyOn(cycle, 'getPhase').mockReturnValue('visible')

    handleOf(wrapper).triggerRegenerate()

    // The churn always runs on a pixel-mosaic preset…
    const churnModes = [PRESETS['pixels-mechanic'].modes.dark, PRESETS['pixels-organic'].modes.dark]
    await vi.waitFor(() => {
      expect(churnModes).toContain(vi.mocked(engine.setInstancePreset).mock.calls.at(-1)![1])
    })
    // …and the palette is sampled with the CHURN preset's slots. A flat white
    // source maps to a flat white palette, which is then pushed on the instance.
    expect(engine.samplePaletteFromCanvas).toHaveBeenCalledTimes(1)
    const [, sampledSlots] = vi.mocked(engine.samplePaletteFromCanvas).mock.calls[0]!
    expect([
      PRESETS['pixels-mechanic'].modes.dark.colors,
      PRESETS['pixels-organic'].modes.dark.colors,
    ]).toContain(sampledSlots)

    const white = Array.from({ length: 7 }, () => '#ffffff')
    await vi.waitFor(() => {
      expect(vi.mocked(engine.setInstanceColors).mock.calls.at(-1)![1]).toEqual(white)
    })
    expect(vi.mocked(engine.setInstanceCardBg).mock.calls.at(-1)![1]).toBe('#ffffff')
    wrapper.unmount()
  })
})

describe('strength', () => {
  it('scales the visible canvas opacity across 0..1', async () => {
    const wrapper = mountCard({ strength: 0.5 })
    const canvas = wrapper.element.querySelector('.image-gen-shader') as HTMLCanvasElement
    expect(createInstanceSpy().mock.calls[0]![0].strength).toBe(0.5)
    expect(canvas.style.opacity).toBe('0.5')

    await wrapper.setProps({ strength: 0.25 })
    expect(engine.setInstanceStrength).toHaveBeenLastCalledWith(expect.anything(), 0.25)
    expect(canvas.style.opacity).toBe('0.25')
    wrapper.unmount()
  })

  it('keeps the canvas opaque above 1 and boosts the palette instead', async () => {
    const wrapper = mountCard({ strength: 1.5, theme: 'dark' })
    const canvas = wrapper.element.querySelector('.image-gen-shader') as HTMLCanvasElement
    expect(canvas.style.opacity).toBe('1')

    const uniforms = three.state.materials[0]!.uniforms
    const base = PRESETS['pixels-organic'].modes.dark.intensity
    await vi.waitFor(() => {
      // 1 + (1.5 - 1) * 2.2 → the shader-side intensity push, no opacity change.
      expect(uniforms.u_intensity!.value).toBeCloseTo(base * 2.1, 5)
    })
    expect(canvas.style.opacity).toBe('1')
    wrapper.unmount()
  })
})

describe('measurement', () => {
  it('sizes the instance from the wrapper and takes the radius from the child', () => {
    const wrapper = mountCard({ theme: 'dark' })
    expect(createInstanceSpy().mock.calls[0]![0]).toMatchObject({ cssWidth: 240, cssHeight: 160 })

    const root = wrapper.element as HTMLElement
    expect(root.style.borderRadius).toBe('8px')
    expect(root.style.getPropertyValue('--image-gen-radius')).toBe('8px')
    wrapper.unmount()
  })

  it('falls back to the wrapper radius when the child has none', () => {
    geometry.childRadius = '0px'
    geometry.rootRadius = '6px'
    const wrapper = mountCard()
    expect((wrapper.element as HTMLElement).style.borderRadius).toBe('6px')
    wrapper.unmount()
  })

  it('lets the borderRadius prop win over the measured child radius', () => {
    const wrapper = mountCard({ borderRadius: 12 })
    const root = wrapper.element as HTMLElement
    expect(root.style.borderRadius).toBe('12px')
    expect(root.style.getPropertyValue('--image-gen-radius')).toBe('12px')
    wrapper.unmount()
  })

  it('follows the child when it resizes or changes its radius', async () => {
    const wrapper = mountCard()
    const root = wrapper.element as HTMLElement

    geometry.width = 300
    geometry.height = 200
    geometry.childRadius = '14px'
    await flushResize()

    await vi.waitFor(() => {
      expect(engine.updateInstanceSize).toHaveBeenLastCalledWith(instanceOf(), 300, 200)
      expect(root.style.borderRadius).toBe('14px')
    })
    expect(root.style.getPropertyValue('--image-gen-radius')).toBe('14px')
    wrapper.unmount()
  })

  it('pauses the instance while it is scrolled out of view', () => {
    const wrapper = mountCard()
    expect(intersectionCallbacks).toHaveLength(1)

    const fire = (isIntersecting: boolean) =>
      intersectionCallbacks[0]!([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver)

    fire(false)
    expect(engine.setInstanceVisible).toHaveBeenLastCalledWith(instanceOf(), false)
    fire(true)
    expect(engine.setInstanceVisible).toHaveBeenLastCalledWith(instanceOf(), true)
    wrapper.unmount()
  })
})

describe('lifecycle syncing', () => {
  it('forwards pixelScale, speed and the custom fragment shader to the engine', async () => {
    const wrapper = mountCard({ fragmentShader: 'void main() {}' })
    expect(engine.setSharedFragmentShader).toHaveBeenCalledWith('void main() {}')

    await wrapper.setProps({ pixelScale: 2, speed: 0.5 })
    expect(engine.setInstancePixelScale).toHaveBeenLastCalledWith(instanceOf(), 2)
    expect(engine.setInstanceSpeed).toHaveBeenLastCalledWith(instanceOf(), 0.5)

    wrapper.unmount()
    // Unmounting drops the page-wide custom shader again.
    expect(engine.setSharedFragmentShader).toHaveBeenLastCalledWith(null)
  })

  it('marks the wrapper paused and starts the auto loop only when asked', async () => {
    const wrapper = mountCard({ images: ['a.png'], paused: true })
    const cycle = cycleOf()
    const start = vi.spyOn(cycle, 'start')
    expect((wrapper.element as HTMLElement).dataset.paused).toBe('true')
    expect(start).not.toHaveBeenCalled()

    await wrapper.setProps({ paused: false, autoReveal: true })
    expect((wrapper.element as HTMLElement).dataset.paused).toBeUndefined()
    expect(start).toHaveBeenCalledTimes(1)

    const stop = vi.spyOn(cycle, 'stop')
    await wrapper.setProps({ autoReveal: false })
    expect(stop).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('starts the auto loop on mount when autoReveal is already on', () => {
    const wrapper = mountCard({ images: ['a.png'], autoReveal: true })
    expect(cycleOf().isRunning()).toBe(true)
    wrapper.unmount()
  })

  it('destroys the engine instance on unmount', () => {
    const wrapper = mountCard()
    const instance = instanceOf()
    wrapper.unmount()
    expect(engine.destroyInstance).toHaveBeenCalledWith(instance)
  })
})
