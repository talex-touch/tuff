// @vitest-environment jsdom
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TxVoiceBeam } from '@talex-touch/tuffex/voice-beam'
import {
  VOICE_GLOW_ORGANIC,
  VOICE_GLOW_RESPONSE,
  voiceGlowDriveLevel,
  voiceGlowResponse
} from './voice-glow'
import { createLevelNormalizer } from './voice-level'

/**
 * The composer's glow driven through the real TxVoiceBeam driver on a stepped 60 fps clock, read
 * back as the envelope the driver writes (`--vb-level-<id>`). Each case runs the beam's own
 * defaults as the control, so a failure means the composer's tuning stopped doing its job rather
 * than the harness reading nothing.
 */

enableAutoUnmount(afterEach)

const FRAME_MS = 1000 / 60
let rafQueue: Array<(ts: number) => void> = []
let clock = 0

class IntersectionObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): never[] {
    return []
  }
}

beforeEach(() => {
  rafQueue = []
  clock = 0
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {}
  }))
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
    rafQueue.push(cb)
    return rafQueue.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    null as unknown as CanvasRenderingContext2D
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

interface Sample {
  t: number
  level: number
  /** Each lobe's height multiplier (`--vb-l<i>-<id>`). */
  lobes: number[]
}

/** Mounts the beam as the composer does and steps it for `ms`, the level read from `levelAt(t)`. */
async function runBeam(
  response: Record<string, number>,
  levelAt: (t: number) => number,
  ms: number
): Promise<Sample[]> {
  let current = 0
  const beam = mount(TxVoiceBeam, {
    props: {
      active: true,
      theme: 'light',
      scale: 1.2,
      borderRadius: 24,
      distortion: 0,
      level: () => current,
      ...response
    },
    slots: { default: '<div />' }
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  const el = beam.element as HTMLElement
  const id = el.getAttribute('data-voice-beam')!
  const samples: Sample[] = []
  for (let t = 0; t < ms; t += FRAME_MS) {
    current = levelAt(t)
    clock += FRAME_MS
    const due = rafQueue
    rafQueue = []
    for (const cb of due) cb(clock)
    samples.push({
      t,
      level: Number(el.style.getPropertyValue(`--vb-level-${id}`)),
      lobes: Array.from({ length: 7 }, (_, i) =>
        Number(el.style.getPropertyValue(`--vb-l${i}-${id}`))
      )
    })
  }
  beam.unmount()
  return samples
}

/** The level the beam showed on its last frame before `t`. */
function before(samples: Sample[], t: number): number {
  return samples.filter((sample) => sample.t < t).at(-1)!.level
}

const BEAM_DEFAULTS = {}
const WORD = voiceGlowDriveLevel(0.9)

// Level frames (RMS) from a built-in microphone at arm's length: room tone, then syllables at
// roughly 4–5 Hz with a breath in the middle.
const ROOM_RMS = [0.0025, 0.0028, 0.0022, 0.0031, 0.0026, 0.0029, 0.002, 0.003]
const PHRASE_RMS = [
  0.018, 0.034, 0.012, 0.026, 0.041, 0.016, 0.0045, 0.022, 0.038, 0.029, 0.011, 0.0032, 0.0028,
  0.024, 0.031, 0.013, 0.036, 0.02, 0.006, 0.027, 0.04, 0.017, 0.03, 0.009
]
const PHRASE_MS = (ROOM_RMS.length + PHRASE_RMS.length) * 100
/** Past the room tone and the first words' rise. */
const SPEAKING_FROM = (ROOM_RMS.length + 3) * 100

/** The phrase as the composer feeds it: normalized per frame, then `map`, held for each 100ms frame. */
function fed(map: (level: number) => number): (t: number) => number {
  const normalize = createLevelNormalizer()
  const levels = [...ROOM_RMS, ...PHRASE_RMS].map((rms) => map(normalize(rms)))
  return (t: number) => levels[Math.min(levels.length - 1, Math.floor(t / 100))]!
}

describe('the composer glow follows a voice', () => {
  it('lights a word within the 100ms level frame that carries it', async () => {
    const word = (t: number) => (t >= 500 ? WORD : 0)
    const tuned = await runBeam({ ...VOICE_GLOW_RESPONSE }, word, 2500)
    const control = await runBeam(BEAM_DEFAULTS, word, 2500)
    const settled = before(tuned, 2500)

    expect(before(tuned, 600)).toBeGreaterThan(0.85 * settled)
    // The beam's own envelope is not yet half way there when the next frame lands.
    expect(before(control, 600)).toBeLessThan(0.4 * settled)
  })

  it('drops between two words, so the glow moves with the voice instead of holding', async () => {
    // A word, a 100ms gap (one level frame of silence), the next word.
    const words = (t: number) => (t < 300 || (t >= 400 && t < 700) ? WORD : 0)
    const tuned = await runBeam({ ...VOICE_GLOW_RESPONSE }, words, 700)
    const control = await runBeam(BEAM_DEFAULTS, words, 700)
    const dip = (samples: Sample[]) =>
      (before(samples, 300) - before(samples, 400)) / before(samples, 300)

    expect(dip(tuned)).toBeGreaterThan(0.35)
    expect(dip(control)).toBeLessThan(0.15)
  })

  it('settles within half a second of the last word', async () => {
    const lastWord = (t: number) => (t < 800 ? WORD : 0)
    const tuned = await runBeam({ ...VOICE_GLOW_RESPONSE }, lastWord, 1400)
    const control = await runBeam(BEAM_DEFAULTS, lastWord, 1400)

    expect(before(tuned, 1300)).toBeLessThan(0.1 * before(tuned, 800))
    expect(before(control, 1300)).toBeGreaterThan(0.4 * before(control, 800))
  })

  it('spreads a spoken phrase over the beam’s range instead of pinning it near the top', async () => {
    const spread = (samples: Sample[]) => {
      const speaking = samples
        .filter((sample) => sample.t >= SPEAKING_FROM)
        .map((sample) => sample.level)
        .sort((a, b) => a - b)
      const pick = (q: number) => speaking[Math.floor(q * (speaking.length - 1))]!
      return { p10: pick(0.1), p90: pick(0.9) }
    }
    const tuned = spread(
      await runBeam({ ...VOICE_GLOW_RESPONSE }, fed(voiceGlowDriveLevel), PHRASE_MS)
    )
    // Control: the normalized level straight into the beam's own envelope, as before.
    const control = spread(
      await runBeam(
        BEAM_DEFAULTS,
        fed((level) => level),
        PHRASE_MS
      )
    )

    expect(tuned.p90 - tuned.p10).toBeGreaterThan(0.35)
    expect(tuned.p90).toBeGreaterThan(0.9)
    expect(control.p90 - control.p10).toBeLessThan(0.25)
    expect(control.p10).toBeGreaterThan(0.7)
  })

  it('moves each part of the glow on its own while words are heard', async () => {
    // The outer pair of lobes follows one band of the voice, so without `organic` it rises and
    // falls as a pair, mirrored about the centre.
    const pair = (samples: Sample[]) => {
      const speaking = samples.filter((sample) => sample.t >= SPEAKING_FROM)
      const left = speaking.map((sample) => sample.lobes[5]!)
      const right = speaking.map((sample) => sample.lobes[6]!)
      const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length
      const [ml, mr] = [mean(left), mean(right)]
      let num = 0
      let dl = 0
      let dr = 0
      for (let i = 0; i < left.length; i += 1) {
        num += (left[i]! - ml) * (right[i]! - mr)
        dl += (left[i]! - ml) ** 2
        dr += (right[i]! - mr) ** 2
      }
      return num / Math.sqrt(dl * dr)
    }
    const words = fed(voiceGlowDriveLevel)
    const tuned = await runBeam(voiceGlowResponse(false), words, PHRASE_MS)
    const control = await runBeam({ ...VOICE_GLOW_RESPONSE }, words, PHRASE_MS)

    expect(pair(control)).toBeGreaterThan(0.85)
    expect(pair(tuned)).toBeLessThan(0.5)
  })
})

describe('voiceGlowResponse', () => {
  it('turns the quick envelope and the organic motion on, and both off under reduced motion', () => {
    expect(voiceGlowResponse(false)).toEqual({
      ...VOICE_GLOW_RESPONSE,
      organic: VOICE_GLOW_ORGANIC
    })
    expect(voiceGlowResponse(true)).toEqual({})
  })
})

describe('voiceGlowDriveLevel', () => {
  it('maps silence to silence and full to full, rising monotonically between', () => {
    expect(voiceGlowDriveLevel(0)).toBe(0)
    expect(voiceGlowDriveLevel(1)).toBe(1)
    const ladder = [0.1, 0.3, 0.5, 0.7, 0.9].map(voiceGlowDriveLevel)
    for (let index = 1; index < ladder.length; index += 1)
      expect(ladder[index]!).toBeGreaterThan(ladder[index - 1]!)
  })

  it('reads anything outside 0..1 as the nearest end', () => {
    expect(voiceGlowDriveLevel(-0.2)).toBe(0)
    expect(voiceGlowDriveLevel(Number.NaN)).toBe(0)
    expect(voiceGlowDriveLevel(1.4)).toBe(1)
  })
})
