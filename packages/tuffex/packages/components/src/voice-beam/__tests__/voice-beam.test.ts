import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { parseRgb } from '../src/color'
import { resolveVoiceDefaults, resolveVoiceStyle, voiceDefaults } from '../src/presets'
import { LOBE_SPACING, LOBE_SPAN, voiceLobes, voicePalettes } from '../src/styles'
import { useMicrophone, type UseMicrophoneOptions, type UseMicrophoneResult } from '../src/use-microphone'
import type { VoiceBeamType } from '../src/types'
import TxVoiceBeam from '../src/TxVoiceBeam.vue'

// Every wrapper in this file is unmounted after its test: the driver keeps one
// shared rAF loop and one instance set per module, so a leaked wrapper would be
// stepped by the next test's frames.
enableAutoUnmount(afterEach)

type Entry = { isIntersecting: boolean }
type IntersectionCb = (entries: Entry[]) => void

let intersectionCallbacks: IntersectionCb[] = []

class IntersectionObserverStub {
  private readonly cb: IntersectionCb
  constructor(cb: IntersectionCb) {
    this.cb = cb
    intersectionCallbacks.push(cb)
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): never[] {
    return []
  }
}

// The tests own the clock: nothing steps until `pumpFrames` runs the callbacks.
let rafQueue: Array<(ts: number) => void> = []
let rafClock = 0

function pumpFrames(count: number, step = 20): void {
  for (let i = 0; i < count; i += 1) {
    rafClock += step
    const due = rafQueue
    rafQueue = []
    for (const cb of due) cb(rafClock)
  }
}

const mediaPrefs = { dark: false, reduce: false }

function mediaQuery(query: string): MediaQueryList {
  const matches = query.includes('dark') ? mediaPrefs.dark : query.includes('reduce') ? mediaPrefs.reduce : false
  return {
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList
}

beforeEach(() => {
  mediaPrefs.dark = false
  mediaPrefs.reduce = false
  intersectionCallbacks = []
  rafQueue = []
  rafClock = 0
  vi.stubGlobal('matchMedia', mediaQuery)
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
    rafQueue.push(cb)
    return rafQueue.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as unknown as CanvasRenderingContext2D)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** The instance id, which every per-frame custom property is suffixed with. */
const beamId = (el: HTMLElement): string => el.getAttribute('data-voice-beam') ?? ''

/** Reads a custom property the driver writes, from the inline style. */
function readVar(el: HTMLElement, name: string): number {
  const fromStyle = el.style.getPropertyValue(name)
  const fromAttr = (el.getAttribute('style') ?? '').match(new RegExp(`${name}\\s*:\\s*([^;]+)`))?.[1] ?? ''
  const value = Number.parseFloat(fromStyle || fromAttr)
  expect(Number.isNaN(value), `${name} not written (style="${el.getAttribute('style')}")`).toBe(false)
  return value
}

/** Instance ids differ per mount; the stylesheet must not. */
function normalizeCss(css: string): string {
  return css.replace(/tx-voice-beam-[\w-]+/g, 'ID')
}

function animationEvent(name: string): Event {
  const event = new Event('animationend')
  Object.defineProperty(event, 'animationName', { value: name })
  return event
}

describe('voice-beam presets', () => {
  it('returns the tuned defaults for the default type and dark theme', () => {
    expect(resolveVoiceDefaults('default', 'dark')).toEqual(voiceDefaults)
    expect(resolveVoiceDefaults()).toEqual(voiceDefaults)
  })

  it('retunes the geometry per host type', () => {
    const pill = resolveVoiceDefaults('pill', 'dark')
    expect(pill.scale).toBe(0.45)
    expect(pill.flow).toBe(0)
    expect(pill.bandTail).toBe(0)
    expect(pill.cornerFollow).toBe(0)
    // Keys the type leaves alone keep the tuned default.
    expect(pill.bandSkew).toBe(voiceDefaults.bandSkew)

    const mobile = resolveVoiceDefaults('mobile', 'dark')
    expect(mobile.scale).toBe(1.25)
    expect(mobile.reach).toBe(3)
    expect(mobile.processingLevel).toBe(0.35)
    expect(mobile.softness).toBe(1.1)
  })

  it('layers the light theme around the type preset', () => {
    const light = resolveVoiceDefaults('default', 'light')
    expect(light.reach).toBe(1.8)
    expect(light.spread).toBe(0.8)
    expect(light.coreLight).toBe(1.8)
    expect(light.bandStrength).toBe(1.7)

    // The type's own geometry still wins; the light band strength does not.
    const pill = resolveVoiceDefaults('pill', 'light')
    expect(pill.reach).toBe(1.35)
    expect(pill.coreLight).toBe(1.8)
    expect(pill.bandStrength).toBe(2)
  })

  it('maps the per-type colour tuning and drops the pill lift on light', () => {
    expect(resolveVoiceStyle('default', 'dark')).toEqual({ brightness: 1.15 })
    expect(resolveVoiceStyle('pill', 'dark')).toEqual({ brightness: 1.35, saturation: 1.5 })
    expect(resolveVoiceStyle('pill', 'light')).toEqual({})
    expect(resolveVoiceStyle('mobile', 'light')).toEqual({ strength: 1 })
    expect(resolveVoiceStyle()).toEqual({ brightness: 1.15 })
  })

  it('parses only hex / rgb(a) colours', () => {
    expect(parseRgb('#abc')).toEqual([170, 187, 204])
    expect(parseRgb('#ff0000')).toEqual([255, 0, 0])
    expect(parseRgb('rgb(1, 2, 3)')).toEqual([1, 2, 3])
    expect(parseRgb('rgba(4, 5, 6, 0.5)')).toEqual([4, 5, 6])
    expect(parseRgb('hsl(1, 2% 3%)')).toBeNull()
  })

  it('keeps one palette colour per lobe on both themes', () => {
    for (const variant of Object.keys(voicePalettes) as Array<keyof typeof voicePalettes>) {
      for (const theme of ['dark', 'light'] as const)
        expect(voicePalettes[variant][theme], `${variant}/${theme}`).toHaveLength(voiceLobes.length)
    }
    expect(LOBE_SPAN).toBe(LOBE_SPACING * voiceLobes.length)
  })
})

describe('txVoiceBeam', () => {
  it('marks the root, renders the slot and injects the instance stylesheet', async () => {
    const wrapper = mount(TxVoiceBeam, { slots: { default: '<div class="host">Hi</div>' } })
    await nextTick()

    const el = wrapper.element as HTMLElement
    expect(beamId(el)).toMatch(/^tx-voice-beam-/)
    expect(el.getAttribute('data-voice-type')).toBe('default')
    expect(el.getAttribute('data-voice-halfres')).toBe('')
    expect(el.getAttribute('data-active')).toBe('')
    expect(el.hasAttribute('data-fading')).toBe(false)
    expect(el.hasAttribute('data-listening')).toBe(false)
    expect(el.hasAttribute('data-processing')).toBe(false)
    expect(el.hasAttribute('data-paused')).toBe(false)
    expect(wrapper.find('.host').text()).toBe('Hi')
    expect(wrapper.find('[data-voice-beam-bloom]').exists()).toBe(true)
    expect(wrapper.find('canvas[data-voice-beam-band]').exists()).toBe(true)
    expect(readVar(el, '--voice-strength')).toBe(1)

    const css = wrapper.find('style').text()
    expect(css).toContain(`[data-voice-beam="${beamId(el)}"]`)
    expect(css).toContain(`vb-fade-in-${beamId(el)}`)
  })

  it('merges fallthrough class/style with its own strength variable', async () => {
    const wrapper = mount(TxVoiceBeam, { attrs: { class: 'my-host', style: 'margin: 4px' } })
    await nextTick()

    const el = wrapper.element as HTMLElement
    expect(el.classList.contains('my-host')).toBe(true)
    expect(el.style.margin).toBe('4px')
    expect(readVar(el, '--voice-strength')).toBe(1)
  })

  it('flags the stream and processing states', async () => {
    const stream = { getAudioTracks: () => [] } as unknown as MediaStream
    const wrapper = mount(TxVoiceBeam, { props: { stream, processing: true } })
    await nextTick()

    expect(wrapper.attributes('data-listening')).toBe('')
    expect(wrapper.attributes('data-processing')).toBe('')
  })

  it('marks the frame paused when the paused prop is set', async () => {
    const wrapper = mount(TxVoiceBeam, { props: { paused: true } })
    await nextTick()
    expect(wrapper.attributes('data-paused')).toBe('')
  })

  it('pauses offscreen without touching the active state', async () => {
    const wrapper = mount(TxVoiceBeam)
    await nextTick()
    expect(intersectionCallbacks).toHaveLength(1)

    intersectionCallbacks[0]!([{ isIntersecting: false }])
    await nextTick()
    expect(wrapper.attributes('data-paused')).toBe('')
    expect(wrapper.attributes('data-active')).toBe('')

    intersectionCallbacks[0]!([{ isIntersecting: true }])
    await nextTick()
    expect(wrapper.attributes('data-paused')).toBeUndefined()
  })

  it('runs the fade lifecycle and emits activate / deactivate', async () => {
    const wrapper = mount(TxVoiceBeam)
    const el = wrapper.element as HTMLElement
    expect(el.hasAttribute('data-active')).toBe(true)

    await wrapper.setProps({ active: false })
    expect(el.hasAttribute('data-fading')).toBe(true)
    expect(wrapper.emitted('deactivate')).toBeUndefined()

    el.dispatchEvent(animationEvent('voice-fade-out'))
    await nextTick()
    expect(wrapper.emitted('deactivate')).toHaveLength(1)
    expect(el.hasAttribute('data-active')).toBe(false)
    expect(el.hasAttribute('data-fading')).toBe(false)

    await wrapper.setProps({ active: true })
    expect(el.hasAttribute('data-active')).toBe(true)
    el.dispatchEvent(animationEvent('voice-fade-in'))
    await nextTick()
    expect(wrapper.emitted('activate')).toHaveLength(1)
  })

  it('follows prefers-color-scheme for theme="auto"', async () => {
    const auto = mount(TxVoiceBeam, { props: { theme: 'auto' } })
    const light = mount(TxVoiceBeam, { props: { theme: 'light' } })
    const dark = mount(TxVoiceBeam, { props: { theme: 'dark' } })
    await nextTick()

    const lightCss = normalizeCss(light.find('style').text())
    const darkCss = normalizeCss(dark.find('style').text())
    expect(normalizeCss(auto.find('style').text())).toBe(lightCss)
    expect(lightCss).not.toBe(darkCss)

    mediaPrefs.dark = true
    const autoDark = mount(TxVoiceBeam, { props: { theme: 'auto' } })
    await nextTick()
    expect(normalizeCss(autoDark.find('style').text())).toBe(darkCss)
  })

  it('falls back to the default preset for a type outside the union', async () => {
    const bogus = mount(TxVoiceBeam, { props: { type: 'bogus' as VoiceBeamType } })
    const plain = mount(TxVoiceBeam)
    await nextTick()

    expect(bogus.attributes('data-voice-type')).toBe('bogus')
    expect(normalizeCss(bogus.find('style').text())).toBe(normalizeCss(plain.find('style').text()))
  })

  it('fills only the named palette slots and keeps the variant colour for the rest', async () => {
    const custom = mount(TxVoiceBeam, { props: { colors: ['#ff0000'] } })
    const invalid = mount(TxVoiceBeam, { props: { colors: ['not-a-color'] } })
    const plain = mount(TxVoiceBeam)
    await nextTick()

    expect(normalizeCss(custom.find('style').text())).toContain('rgb(255, 0, 0)')
    expect(normalizeCss(invalid.find('style').text())).not.toContain('rgb(255, 0, 0)')
    expect(normalizeCss(invalid.find('style').text())).toBe(normalizeCss(plain.find('style').text()))
  })

  it('drives the glow from the level prop when Web Audio is unavailable', async () => {
    // jsdom has no AudioContext, so `acquireAnalyser` returns null and the
    // driver must fall back to the manual level. `distortion: 0` keeps the
    // frames out of the SVG displacement filter: jsdom has no
    // `SVGFEDisplacementMapElement.scale`, so that path cannot be stepped here.
    const stream = { getAudioTracks: () => [] } as unknown as MediaStream
    const loud = mount(TxVoiceBeam, { props: { distortion: 0, level: 1, stream } })
    const quiet = mount(TxVoiceBeam, { props: { distortion: 0, level: 0 } })
    await nextTick()

    pumpFrames(40)
    const loudGlow = readVar(loud.element as HTMLElement, `--vb-glow-${beamId(loud.element as HTMLElement)}`)
    const quietGlow = readVar(quiet.element as HTMLElement, `--vb-glow-${beamId(quiet.element as HTMLElement)}`)

    expect(loudGlow).toBeGreaterThan(0.5)
    expect(quietGlow).toBeLessThan(0.4)
    expect(loudGlow).toBeGreaterThan(quietGlow + 0.3)

    const reported = loud.emitted('level') ?? []
    expect(reported.length).toBeGreaterThan(0)
    expect(reported.at(-1)![0] as number).toBeGreaterThan(0.5)
  })

  it('holds the hue drift at zero under prefers-reduced-motion', async () => {
    // `distortion: 0` for the same jsdom reason as the fallback test above.
    mediaPrefs.reduce = true
    const wrapper = mount(TxVoiceBeam, { props: { distortion: 0, level: 1 } })
    await nextTick()
    pumpFrames(40)

    const el = wrapper.element as HTMLElement
    expect(readVar(el, `--vb-hue-${beamId(el)}`)).toBe(0)
    // The voice still drives the glow; only the motion is held.
    expect(readVar(el, `--vb-glow-${beamId(el)}`)).toBeGreaterThan(0.5)
  })
})

describe('useMicrophone', () => {
  let mic: UseMicrophoneResult | null = null

  /** Mounts a host that owns the composable, and returns its wrapper. */
  function mountMic(options?: UseMicrophoneOptions) {
    const Host = defineComponent({
      setup() {
        mic = useMicrophone(options)
        return () => h('div')
      },
    })
    return mount(Host)
  }

  const audioTrack = (): MediaStreamTrack =>
    ({ stop: vi.fn(), addEventListener: vi.fn() }) as unknown as MediaStreamTrack

  function stubMediaDevices(getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>): void {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } } as unknown as Navigator)
  }

  it('reports unsupported without getUserMedia and refuses to start', async () => {
    vi.stubGlobal('navigator', {} as Navigator)
    mountMic()
    expect(mic!.supported.value).toBe(false)
    expect(mic!.state.value).toBe('unsupported')
    expect(await mic!.start()).toBeNull()
    expect(mic!.state.value).toBe('unsupported')
  })

  it('walks idle → requesting → live with the browser voice processing off, then stops the tracks', async () => {
    const track = audioTrack()
    const stream = {
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream
    const getUserMedia = vi.fn(async () => stream)
    stubMediaDevices(getUserMedia)
    mountMic()

    expect(mic!.supported.value).toBe(true)
    expect(mic!.state.value).toBe('idle')
    expect(mic!.stream.value).toBeNull()

    const pending = mic!.start()
    expect(mic!.state.value).toBe('requesting')

    expect(await pending).toBe(stream)
    expect(mic!.state.value).toBe('live')
    expect(mic!.stream.value).toBe(stream)
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })

    mic!.stop()
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(mic!.state.value).toBe('idle')
    expect(mic!.stream.value).toBeNull()
  })

  it('merges caller constraints over the raw-signal defaults', async () => {
    const getUserMedia = vi.fn(
      async () => ({ getTracks: () => [], getAudioTracks: () => [] }) as unknown as MediaStream,
    )
    stubMediaDevices(getUserMedia)
    mountMic({ constraints: { echoCancellation: true } })

    await mic!.start()
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    })
  })

  it('reports a denied permission and keeps the error', async () => {
    const denied = new Error('denied')
    denied.name = 'NotAllowedError'
    stubMediaDevices(
      vi.fn(async () => {
        throw denied
      }),
    )
    mountMic()

    expect(await mic!.start()).toBeNull()
    expect(mic!.state.value).toBe('denied')
    expect(mic!.error.value).toBe(denied)
    expect(mic!.stream.value).toBeNull()
  })

  it('stops the live stream when the caller unmounts', async () => {
    const track = audioTrack()
    const stream = {
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream
    stubMediaDevices(vi.fn(async () => stream))
    const wrapper = mountMic()

    await mic!.start()
    wrapper.unmount()
    expect(track.stop).toHaveBeenCalledTimes(1)
  })

  it('starts on mount when autoStart is set', async () => {
    const stream = { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream
    const getUserMedia = vi.fn(async () => stream)
    stubMediaDevices(getUserMedia)
    mountMic({ autoStart: true })

    await nextTick()
    await Promise.resolve()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(mic!.state.value).toBe('live')
  })
})
