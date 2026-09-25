import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  configureSound,
  disposeSound,
  getSoundConfig,
  isSoundSupported,
  playSound,
  SOUND_PRESETS,
  sound,
} from '../sound'

/**
 * jsdom has no Web Audio, and a sound cannot be asserted by listening to it.
 * This mock records the graph that gets built — node types, connections, and
 * every scheduled param change — so the tests assert on the *schedule*, which
 * is what actually determines what is heard.
 */
interface ParamCall { method: string, value: number, time: number }

class FakeParam {
  calls: ParamCall[] = []
  value = 0
  setValueAtTime(value: number, time: number) { this.calls.push({ method: 'set', value, time }) }
  exponentialRampToValueAtTime(value: number, time: number) { this.calls.push({ method: 'expo', value, time }) }
  linearRampToValueAtTime(value: number, time: number) { this.calls.push({ method: 'linear', value, time }) }
}

class FakeNode {
  connected: FakeNode[] = []
  disconnectCount = 0
  onended: (() => void) | null = null
  started: number | null = null
  stopped: number | null = null
  connect(target: FakeNode) { this.connected.push(target); return target }
  disconnect() { this.disconnectCount += 1 }
  start(time: number) { this.started = time }
  stop(time: number) { this.stopped = time }
}

class FakeGain extends FakeNode { gain = new FakeParam() }
class FakeOsc extends FakeNode { type = 'sine'; frequency = new FakeParam() }
class FakeBufferSource extends FakeNode { buffer: unknown = null }

class FakeContext {
  static instances: FakeContext[] = []
  state: 'running' | 'suspended' | 'closed' = 'running'
  currentTime = 10
  sampleRate = 48000
  destination = new FakeNode()
  gains: FakeGain[] = []
  oscs: FakeOsc[] = []
  sources: FakeBufferSource[] = []
  buffersCreated = 0
  resumed = 0
  closed = 0

  constructor() { FakeContext.instances.push(this) }
  createGain() { const g = new FakeGain(); this.gains.push(g); return g }
  createOscillator() { const o = new FakeOsc(); this.oscs.push(o); return o }
  createBufferSource() { const s = new FakeBufferSource(); this.sources.push(s); return s }
  createBuffer(_ch: number, length: number, sampleRate: number) {
    this.buffersCreated += 1
    return { sampleRate, length, getChannelData: () => new Float32Array(length) }
  }

  resume() { this.resumed += 1; this.state = 'running'; return Promise.resolve() }
  close() { this.closed += 1; this.state = 'closed'; return Promise.resolve() }
}

function ctx(): FakeContext {
  return FakeContext.instances.at(-1)!
}

/**
 * This project runs on the node environment, so `window` is injected the same
 * way `vibrate.test.ts` does it rather than switching this file to jsdom — one
 * environment across the package keeps the suite's startup cost flat.
 */
function setWindow(value: Record<string, unknown> | undefined): void {
  Object.defineProperty(globalThis, 'window', {
    value,
    writable: true,
    configurable: true,
  })
}

beforeEach(() => {
  FakeContext.instances = []
  setWindow({ AudioContext: FakeContext })
  disposeSound()
  configureSound({ enabled: false, volume: 0.6 })
})

afterEach(() => {
  disposeSound()
  setWindow(undefined)
  delete (globalThis as any).window
  vi.restoreAllMocks()
})

describe('sound', () => {
  it('is off by default, and builds no audio graph at all', () => {
    expect(getSoundConfig().enabled).toBe(false)
    expect(playSound('click')).toBe(false)

    // Not merely silent — a library that opens an AudioContext on import leaks
    // one for every page that never plays anything.
    expect(FakeContext.instances).toHaveLength(0)
  })

  it('plays once enabled', () => {
    configureSound({ enabled: true })

    expect(playSound('click')).toBe(true)
    expect(ctx().oscs).toHaveLength(1)
  })

  it('creates the context lazily, then reuses it', () => {
    configureSound({ enabled: true })
    playSound('click')
    playSound('click')

    expect(FakeContext.instances).toHaveLength(1)
  })

  it('routes every voice through the master gain, not straight to the output', () => {
    configureSound({ enabled: true, volume: 0.3 })
    playSound('click')

    const [master] = ctx().gains
    expect(master!.connected).toContain(ctx().destination)
    expect(master!.gain.value).toBe(0.3)

    // The envelope feeds the master; nothing bypasses the volume control.
    const envelope = ctx().gains[1]!
    expect(envelope.connected).toContain(master)
  })

  it('schedules one voice per layer of the preset', () => {
    configureSound({ enabled: true })
    playSound('success')

    expect(SOUND_PRESETS.success.layers).toHaveLength(2)
    expect(ctx().oscs).toHaveLength(2)
  })

  it('never ramps a gain from exactly zero', () => {
    configureSound({ enabled: true })
    playSound('click')

    // `exponentialRampToValueAtTime` from 0 is a no-op that leaves the gain
    // stepping, and a step in a gain curve is an audible click on top of the
    // tone the cue is supposed to be.
    const envelope = ctx().gains[1]!
    for (const call of envelope.gain.calls)
      expect(call.value).toBeGreaterThan(0)
  })

  it('gives every voice an attack, a peak and a return to silence', () => {
    configureSound({ enabled: true })
    playSound('click')

    const calls = ctx().gains[1]!.gain.calls
    expect(calls).toHaveLength(3)
    expect(calls[0]!.value).toBeLessThan(calls[1]!.value)
    expect(calls[2]!.value).toBeLessThan(calls[1]!.value)
    expect(calls[0]!.time).toBeLessThan(calls[1]!.time)
    expect(calls[1]!.time).toBeLessThan(calls[2]!.time)
  })

  it('glides a two-value frequency and holds a single one', () => {
    configureSound({ enabled: true })
    playSound('open')
    const gliding = ctx().oscs[0]!.frequency.calls
    expect(gliding.some(c => c.method === 'expo')).toBe(true)

    disposeSound()
    playSound('click')
    const held = ctx().oscs[0]!.frequency.calls
    expect(held.every(c => c.method === 'set')).toBe(true)
  })

  it('gives open and close the same shape in opposite directions', () => {
    // Direction is what carries the meaning, so they must not drift apart.
    const open = SOUND_PRESETS.open.layers[0]!.freq as [number, number]
    const close = SOUND_PRESETS.close.layers[0]!.freq as [number, number]
    expect(open[0]).toBe(close[1])
    expect(open[1]).toBe(close[0])
  })

  it('offsets a delayed layer instead of stacking both notes at once', () => {
    configureSound({ enabled: true })
    playSound('error')

    const [first, second] = ctx().oscs
    expect(second!.started).toBeGreaterThan(first!.started!)
  })

  it('stops every source it starts, so nothing runs forever', () => {
    configureSound({ enabled: true })
    playSound('success')

    for (const osc of ctx().oscs) {
      expect(osc.started).not.toBeNull()
      expect(osc.stopped!).toBeGreaterThan(osc.started!)
    }
  })

  it('tears down each envelope when its voice ends', () => {
    configureSound({ enabled: true })
    playSound('click')

    const envelope = ctx().gains[1]!
    expect(envelope.disconnectCount).toBe(0)
    ctx().oscs[0]!.onended?.()
    // Without this a typing burst leaves hundreds of dead nodes on the master.
    expect(envelope.disconnectCount).toBe(1)
  })

  it('reuses one noise buffer across keystrokes', () => {
    configureSound({ enabled: true })
    playSound('key')
    playSound('key')
    playSound('key')

    expect(ctx().sources.length).toBe(3)
    expect(ctx().buffersCreated).toBe(1)
  })

  it('resumes a context parked by the autoplay policy', () => {
    configureSound({ enabled: true })
    playSound('click')
    ctx().state = 'suspended'
    playSound('click')

    expect(ctx().resumed).toBe(1)
  })

  it('clamps the volume and ignores nonsense', () => {
    expect(configureSound({ volume: 5 }).volume).toBe(1)
    expect(configureSound({ volume: -2 }).volume).toBe(0)
    expect(configureSound({ volume: Number.NaN }).volume).toBe(0)
  })

  it('applies a volume change to a graph that already exists', () => {
    configureSound({ enabled: true, volume: 0.8 })
    playSound('click')
    expect(ctx().gains[0]!.gain.value).toBe(0.8)

    configureSound({ volume: 0.2 })
    expect(ctx().gains[0]!.gain.value).toBe(0.2)
  })

  it('accepts a custom preset', () => {
    configureSound({ enabled: true })

    expect(playSound({ layers: [{ wave: 'square', freq: 300 }, { wave: 'square', freq: 400 }] })).toBe(true)
    expect(ctx().oscs).toHaveLength(2)
    expect(ctx().oscs[0]!.type).toBe('square')
  })

  it('reports unsupported and stays silent without Web Audio', () => {
    setWindow({})

    expect(isSoundSupported()).toBe(false)
    configureSound({ enabled: true })
    // A feedback channel must never be the reason an interaction throws.
    expect(() => playSound('click')).not.toThrow()
    expect(playSound('click')).toBe(false)
  })

  it('survives a context that throws on construction', () => {
    setWindow({ AudioContext: class { constructor() { throw new Error('denied') } } })
    configureSound({ enabled: true })

    expect(() => playSound('click')).not.toThrow()
    expect(playSound('click')).toBe(false)
  })

  it('closes the graph on dispose and rebuilds on the next play', () => {
    configureSound({ enabled: true })
    playSound('click')
    const first = ctx()

    disposeSound()
    expect(first.closed).toBe(1)

    playSound('click')
    expect(FakeContext.instances).toHaveLength(2)
  })

  it('exposes a shorthand per preset', () => {
    configureSound({ enabled: true })

    for (const key of Object.keys(SOUND_PRESETS) as (keyof typeof SOUND_PRESETS)[])
      expect(typeof sound[key]).toBe('function')

    expect(sound.click()).toBe(true)
  })

  it('keeps every cue short enough to still be about the interaction', () => {
    // Two different jobs, two different budgets. An immediate-feedback cue has
    // to land while the finger is still down, so it is held to 80ms. A status
    // cue reports an outcome and is allowed the time a two-note figure needs —
    // but a cue that outlasts the interaction arrives after the user moved on,
    // so it is still capped.
    const IMMEDIATE = new Set(['click', 'key', 'toggle'])

    for (const [name, preset] of Object.entries(SOUND_PRESETS)) {
      const budget = IMMEDIATE.has(name) ? 0.08 : 0.25
      for (const layer of preset.layers) {
        const total = (layer.delay ?? 0) + (layer.attack ?? 0.002) + (layer.decay ?? 0.06)
        expect(total, `${name} runs too long`).toBeLessThanOrEqual(budget)
      }
    }
  })

  it('keeps the keystroke quieter than the click it sits under', () => {
    // `key` fires per character; at click volume it becomes a typewriter.
    const key = SOUND_PRESETS.key.layers[0]!.gain!
    const click = SOUND_PRESETS.click.layers[0]!.gain!
    expect(key).toBeLessThan(click)
  })
})
