import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  organicCrest,
  organicLean,
  organicLobeLift,
  organicLobeShift,
  organicNoise,
  organicRipple,
  organicSway,
} from '../src/organic'
import { resolveVoiceDefaults } from '../src/presets'
import TxVoiceBeam from '../src/TxVoiceBeam.vue'

// The beam's shared driver keeps one rAF loop and one instance set per module,
// so every wrapper is unmounted after its test (see voice-beam.test.ts).
enableAutoUnmount(afterEach)

const FRAME_MS = 1000 / 60
const HOST_WIDTH = 718
const HOST_HEIGHT = 90
const SCALE = 1.2
/** Where the band line sits at silence: `bandOffset` px below the host's bottom edge. */
const LINE_BASE = HOST_HEIGHT - resolveVoiceDefaults('default', 'light').bandOffset * SCALE

let rafQueue: Array<(ts: number) => void> = []
let rafClock = 0
const mediaPrefs = { reduce: false }

class IntersectionObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): never[] {
    return []
  }
}

/** A 2D context that accepts every call: the driver then traces the band line and writes its clip polygons. */
function inertContext(): CanvasRenderingContext2D {
  const state: Record<string, unknown> = { filter: 'none' }
  return new Proxy(state, {
    get(target, key: string) {
      if (key in target)
        return target[key]
      return key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}
    },
    set(target, key: string, value) {
      target[key] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  rafQueue = []
  rafClock = 0
  mediaPrefs.reduce = false
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? mediaPrefs.reduce : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
    rafQueue.push(cb)
    return rafQueue.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => inertContext() as never)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

interface Frame {
  t: number
  /** Every `--vb-*` variable the driver wrote, by name with the instance id taken out. */
  vars: Record<string, string>
  lobes: number[]
  /** The band line's height above its resting base at each sample, px. */
  line: number[]
  cx: number
}

function bandLine(polygon: string): number[] {
  const points = polygon.slice(polygon.indexOf('(') + 1, polygon.lastIndexOf(')')).split(',').slice(1, -1)
  return points.map(point => LINE_BASE - Number.parseFloat(point.trim().split(/\s+/)[1]!))
}

/** Mounts a light, chat-input-sized beam and steps it at 60 fps for `ms`, the level read from `levelAt(t)`. */
async function runBeam(
  props: Record<string, unknown>,
  levelAt: (t: number) => number,
  ms: number,
  onFrame?: (t: number, wrapper: ReturnType<typeof mount>) => Promise<void> | void,
): Promise<Frame[]> {
  let current = 0
  const wrapper = mount(TxVoiceBeam, {
    props: { theme: 'light', scale: SCALE, borderRadius: 24, distortion: 0, level: () => current, ...props },
    slots: { default: '<div />' },
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  const el = wrapper.element as HTMLElement
  Object.defineProperty(el, 'clientWidth', { value: HOST_WIDTH })
  Object.defineProperty(el, 'clientHeight', { value: HOST_HEIGHT })
  const id = el.getAttribute('data-voice-beam')!
  const frames: Frame[] = []
  for (let t = 0; t < ms; t += FRAME_MS) {
    await onFrame?.(t, wrapper)
    current = levelAt(t)
    rafClock += FRAME_MS
    const due = rafQueue
    rafQueue = []
    for (const cb of due) cb(rafClock)
    const vars: Record<string, string> = {}
    for (let i = 0; i < el.style.length; i++) {
      const name = el.style.item(i)
      if (name.startsWith('--vb-'))
        vars[name.replace(id, 'ID')] = el.style.getPropertyValue(name)
    }
    frames.push({
      t,
      vars,
      lobes: Array.from({ length: 7 }, (_, i) => Number(vars[`--vb-l${i}-ID`])),
      line: vars['--vb-clip-below-ID'] ? bandLine(vars['--vb-clip-below-ID']) : [],
      cx: Number.parseFloat(vars['--vb-cx-ID'] ?? '0'),
    })
  }
  wrapper.unmount()
  return frames
}

/** Syllables at about 4.5 Hz from 0.5 s, each at its own loudness, with a breath at 1.6 s. */
function speech(t: number): number {
  if (t < 500 || (t >= 1600 && t < 1800))
    return 0
  const syllable = Math.floor(t / 220)
  const loudness = 0.55 + 0.45 * Math.abs(Math.sin(syllable * 2.3))
  return loudness * Math.sin(Math.PI * ((t % 220) / 220)) ** 0.6
}

function correlation(a: number[], b: number[]): number {
  const n = a.length
  const ma = a.reduce((sum, v) => sum + v, 0) / n
  const mb = b.reduce((sum, v) => sum + v, 0) / n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    num += (a[i]! - ma) * (b[i]! - mb)
    da += (a[i]! - ma) ** 2
    db += (b[i]! - mb) ** 2
  }
  return num / Math.sqrt(da * db)
}

/**
 * How much the band line's shape changes, apart from its size: each frame's
 * line divided by its own peak, then the spread of every sample across frames.
 * A line that only scales scores near zero.
 */
function shapeChange(frames: Frame[]): number {
  const profiles = frames.filter(frame => Math.max(...frame.line) > 20).map((frame) => {
    const peak = Math.max(...frame.line)
    return frame.line.map(v => v / peak)
  })
  let total = 0
  for (let i = 0; i < profiles[0]!.length; i++) {
    const column = profiles.map(profile => profile[i]!)
    const mean = column.reduce((sum, v) => sum + v, 0) / column.length
    total += Math.sqrt(column.reduce((sum, v) => sum + (v - mean) ** 2, 0) / column.length)
  }
  return total / profiles[0]!.length
}

const speaking = (frames: Frame[]) => frames.filter(frame => frame.t >= 700 && frame.t < 2600)

describe('organic signals', () => {
  const signals: Record<string, (t: number) => number> = {
    'noise': t => organicNoise(5, t * 2.9),
    'lobe lift': t => organicLobeLift(4, t),
    'lobe shift': t => organicLobeShift(4, t),
    'sway': organicSway,
    'lean': organicLean,
    'crest': organicCrest,
    'ripple': t => organicRipple(0.3, t),
  }

  it('stay within −1 … 1 and give the same value for the same instant', () => {
    for (const signal of Object.values(signals)) {
      for (let t = 0; t < 300; t += FRAME_MS / 1000) {
        const value = signal(t)
        expect(Math.abs(value)).toBeLessThanOrEqual(1)
        expect(signal(t)).toBe(value)
      }
    }
  })

  it('move smoothly from one frame to the next', () => {
    for (const signal of Object.values(signals)) {
      let largest = 0
      for (let t = FRAME_MS / 1000; t < 300; t += FRAME_MS / 1000)
        largest = Math.max(largest, Math.abs(signal(t) - signal(t - FRAME_MS / 1000)))
      expect(largest).toBeLessThan(0.2)
    }
  })

  it('give every lobe a height of its own', () => {
    const times = Array.from({ length: 3600 }, (_, i) => i / 60)
    const lifts = Array.from({ length: 7 }, (_, lobe) => times.map(t => organicLobeLift(lobe, t)))
    for (let a = 0; a < 7; a++) {
      for (let b = a + 1; b < 7; b++)
        expect(Math.abs(correlation(lifts[a]!, lifts[b]!))).toBeLessThan(0.3)
    }
  })
})

describe('txVoiceBeam organic', () => {
  it('is off by default: no prop and `organic: 0` paint the same frames', async () => {
    const unset = await runBeam({}, speech, 2600)
    const zero = await runBeam({ organic: 0 }, speech, 2600)
    expect(zero.map(frame => frame.vars)).toEqual(unset.map(frame => frame.vars))
  })

  it('moves each part on its own while a voice is heard, instead of scaling one arch', async () => {
    // A dictation host's quick envelope: on the default slow one, the swell every lobe shares
    // dominates any pair of them over a couple of seconds.
    const quick = { attack: 0.05, release: 0.18 }
    const plain = speaking(await runBeam(quick, speech, 2600))
    const organic = speaking(await runBeam({ ...quick, organic: 1 }, speech, 2600))

    // The outer pair follows one band: in step without `organic`, apart with it.
    const pair = (frames: Frame[]) => correlation(frames.map(f => f.lobes[5]!), frames.map(f => f.lobes[6]!))
    expect(pair(plain)).toBeGreaterThan(0.85)
    expect(pair(organic)).toBeLessThan(0.5)

    // The band line changes shape, not only size.
    expect(shapeChange(organic)).toBeGreaterThan(2 * shapeChange(plain))

    // The arch sways; without `organic` it stays centred.
    const sway = (frames: Frame[]) => Math.max(...frames.map(f => f.cx)) - Math.min(...frames.map(f => f.cx))
    expect(sway(plain)).toBe(0)
    expect(sway(organic)).toBeGreaterThan(6)
  })

  it('is still in silence', async () => {
    const plain = await runBeam({}, () => 0, 1500)
    const organic = await runBeam({ organic: 1 }, () => 0, 1500)
    expect(organic.map(frame => frame.vars)).toEqual(plain.map(frame => frame.vars))
  })

  it('stays out of reduced motion', async () => {
    mediaPrefs.reduce = true
    const plain = await runBeam({}, speech, 2600)
    const organic = await runBeam({ organic: 1 }, speech, 2600)
    expect(organic.map(frame => frame.vars)).toEqual(plain.map(frame => frame.vars))
  })

  it('gives way to the processing beam', async () => {
    const processAt = 1200
    const startProcessing = async (t: number, wrapper: ReturnType<typeof mount>) => {
      if (t >= processAt && !wrapper.props('processing'))
        await wrapper.setProps({ processing: true })
    }
    const plain = await runBeam({}, speech, 4500, startProcessing)
    const organic = await runBeam({ organic: 1 }, speech, 4500, startProcessing)
    // Its own envelope lets go over a third of a second once the morph lands; the line is written
    // to 0.1 px, so what is left by then is rounding.
    const settled = (frames: Frame[]) => frames.filter(frame => frame.t >= 4000)
    const [a, b] = [settled(plain), settled(organic)]
    for (let i = 0; i < a.length; i++) {
      expect(Math.abs(b[i]!.cx - a[i]!.cx)).toBeLessThan(0.15)
      for (let lobe = 0; lobe < 7; lobe++)
        expect(Math.abs(b[i]!.lobes[lobe]! - a[i]!.lobes[lobe]!)).toBeLessThan(0.01)
      for (let sample = 0; sample < a[i]!.line.length; sample++)
        expect(Math.abs(b[i]!.line[sample]! - a[i]!.line[sample]!)).toBeLessThanOrEqual(0.2)
    }
  })
})
