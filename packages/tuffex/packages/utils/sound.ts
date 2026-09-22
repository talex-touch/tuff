import { hasWindow } from './env'

/**
 * Built-in UI feedback sounds.
 *
 * These are synthesised, not sampled: a handful of oscillators and an envelope
 * costs nothing to ship, stays crisp at any sample rate, and cannot 404. The
 * set is deliberately small — a UI that plays seven different sounds is noise.
 *
 * @public
 */
export type SoundType =
  | 'click'
  | 'key'
  | 'toggle'
  | 'success'
  | 'error'
  | 'open'
  | 'close'

/**
 * One voice in a preset.
 *
 * @public
 */
export interface SoundLayer {
  /** Waveform. `noise` is white noise, for the transient in a key press. */
  wave: 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise'

  /**
   * Frequency in Hz, or `[from, to]` for a glide. Ignored for `noise`.
   *
   * A glide is what separates "open" from "close" — same envelope, opposite
   * direction — so direction carries the meaning, not volume.
   */
  freq: number | [number, number]

  /**
   * Peak gain, 0–1, before the master volume.
   * @default 0.1
   */
  gain?: number

  /**
   * Attack in seconds. Never 0: a gain jumping from silence to peak in one
   * sample is a click of its own, audible as a tick on top of the tone.
   * @default 0.002
   */
  attack?: number

  /**
   * Decay to silence, in seconds.
   * @default 0.06
   */
  decay?: number

  /** Start offset in seconds, for the second note of a two-tone cue. */
  delay?: number
}

/**
 * @public
 */
export interface SoundPreset {
  layers: SoundLayer[]
  description?: string
}

/**
 * Preset voices.
 *
 * Kept short on purpose — a UI sound that outlasts the interaction it reports
 * arrives after the user has moved on. Nothing here runs past 180ms.
 *
 * @public
 */
export const SOUND_PRESETS: Record<SoundType, SoundPreset> = {
  click: {
    layers: [{ wave: 'triangle', freq: 1760, gain: 0.11, decay: 0.045 }],
    description: 'Button press — one short, bright tick',
  },
  key: {
    // Quieter and shorter than a click: it fires per keystroke, so anything
    // heavier becomes a typewriter.
    layers: [
      { wave: 'triangle', freq: 1180, gain: 0.055, decay: 0.028 },
      { wave: 'noise', freq: 0, gain: 0.012, decay: 0.016 },
    ],
    description: 'Keystroke in a text field',
  },
  toggle: {
    layers: [{ wave: 'sine', freq: [880, 1320], gain: 0.09, decay: 0.07 }],
    description: 'Switch or checkbox flipping on',
  },
  success: {
    layers: [
      { wave: 'sine', freq: 660, gain: 0.09, decay: 0.1 },
      { wave: 'sine', freq: 990, gain: 0.09, decay: 0.13, delay: 0.07 },
    ],
    description: 'Completed action — a rising pair',
  },
  error: {
    layers: [
      { wave: 'sine', freq: 420, gain: 0.1, decay: 0.12 },
      { wave: 'sine', freq: 300, gain: 0.1, decay: 0.14, delay: 0.09 },
    ],
    description: 'Rejected action — a falling pair',
  },
  open: {
    layers: [{ wave: 'sine', freq: [520, 900], gain: 0.08, decay: 0.1 }],
    description: 'Panel or dialog opening',
  },
  close: {
    layers: [{ wave: 'sine', freq: [900, 520], gain: 0.08, decay: 0.1 }],
    description: 'Panel or dialog closing',
  },
}

/**
 * @public
 */
export interface SoundConfig {
  /**
   * Whether anything plays at all.
   *
   * **Off by default.** A component library that starts making noise on import
   * is a library the host has to go and disable; opting in is one call, opting
   * out after a surprise is a bug report.
   */
  enabled: boolean

  /** Master volume, 0–1. @default 0.6 */
  volume: number
}

const config: SoundConfig = { enabled: false, volume: 0.6 }

let context: AudioContext | null = null
let master: GainNode | null = null

function clamp01(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return Math.min(1, Math.max(0, value))
}

/**
 * Whether the browser can synthesise at all.
 *
 * @public
 */
export function isSoundSupported(): boolean {
  if (!hasWindow())
    return false
  return typeof (window.AudioContext ?? (window as any).webkitAudioContext) === 'function'
}

/**
 * Lazily builds the graph.
 *
 * Deliberately not created at module load: browsers start an AudioContext in
 * `suspended` state unless it is constructed inside a user gesture, and an
 * orphaned suspended context is a resource leak for every page that imports
 * this file and never plays anything.
 */
function ensureGraph(): GainNode | null {
  if (!isSoundSupported())
    return null

  if (!context || context.state === 'closed') {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext
    context = new Ctor()
    master = null
  }

  // Autoplay policy parks the context until a gesture. Resuming is a no-op
  // when it is already running, and rejects harmlessly when there has been no
  // gesture yet — so nothing is thrown at a caller who just clicked too early.
  if (context.state === 'suspended')
    void context.resume().catch(() => {})

  if (!master || master.context !== context) {
    master = context.createGain()
    master.connect(context.destination)
  }

  master.gain.value = clamp01(config.volume)
  return master
}

/** One shared noise buffer; regenerating it per keystroke is pure waste. */
let noiseBuffer: AudioBuffer | null = null

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate)
    return noiseBuffer

  const length = Math.floor(ctx.sampleRate * 0.2)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1)
    data[i] = Math.random() * 2 - 1

  noiseBuffer = buffer
  return buffer
}

function scheduleLayer(ctx: AudioContext, out: GainNode, layer: SoundLayer): void {
  const start = ctx.currentTime + (layer.delay ?? 0)
  const attack = Math.max(0.001, layer.attack ?? 0.002)
  const decay = Math.max(0.01, layer.decay ?? 0.06)
  const peak = clamp01(layer.gain ?? 0.1)

  const envelope = ctx.createGain()
  envelope.connect(out)

  // Ramp rather than set: `setValueAtTime` from 0 to peak is a discontinuity,
  // and a discontinuity in a gain curve is itself an audible click.
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay)

  const stop = start + attack + decay + 0.02

  if (layer.wave === 'noise') {
    const source = ctx.createBufferSource()
    source.buffer = getNoiseBuffer(ctx)
    source.connect(envelope)
    source.start(start)
    source.stop(stop)
    source.onended = () => envelope.disconnect()
    return
  }

  const osc = ctx.createOscillator()
  osc.type = layer.wave
  if (Array.isArray(layer.freq)) {
    const [from, to] = layer.freq
    osc.frequency.setValueAtTime(Math.max(1, from), start)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + attack + decay)
  }
  else {
    osc.frequency.setValueAtTime(Math.max(1, layer.freq), start)
  }
  osc.connect(envelope)
  osc.start(start)
  osc.stop(stop)
  // Without this every cue leaves a dead GainNode wired to the master, and a
  // typing burst leaves hundreds.
  osc.onended = () => envelope.disconnect()
}

/**
 * Plays a preset, or a custom set of layers.
 *
 * Silent and non-throwing when sound is disabled, unsupported, or the browser
 * has not seen a gesture yet — a feedback channel must never become the reason
 * an interaction fails.
 *
 * @public
 */
export function playSound(sound: SoundType | SoundPreset): boolean {
  if (!config.enabled)
    return false

  try {
    const out = ensureGraph()
    if (!out || !context)
      return false

    const preset = typeof sound === 'string' ? SOUND_PRESETS[sound] : sound
    if (!preset)
      return false

    for (const layer of preset.layers)
      scheduleLayer(context, out, layer)

    return true
  }
  catch {
    return false
  }
}

/**
 * Turns sound on or off, and sets the master volume.
 *
 * @public
 */
export function configureSound(next: Partial<SoundConfig>): SoundConfig {
  if (typeof next.enabled === 'boolean')
    config.enabled = next.enabled
  if (typeof next.volume === 'number')
    config.volume = clamp01(next.volume)

  if (master)
    master.gain.value = clamp01(config.volume)

  return { ...config }
}

/**
 * Current configuration, as a copy.
 *
 * @public
 */
export function getSoundConfig(): SoundConfig {
  return { ...config }
}

/**
 * Releases the audio graph.
 *
 * Worth calling when a host disables sound for good; the next `playSound`
 * rebuilds it from scratch.
 *
 * @public
 */
export function disposeSound(): void {
  try {
    master?.disconnect()
    void context?.close()
  }
  catch {
    // A context already closed by the page is not an error worth surfacing.
  }
  master = null
  context = null
  noiseBuffer = null
}

/**
 * Shorthand players, mirroring the `vibrate` helper's shape.
 *
 * @public
 */
export const sound = {
  click: () => playSound('click'),
  key: () => playSound('key'),
  toggle: () => playSound('toggle'),
  success: () => playSound('success'),
  error: () => playSound('error'),
  open: () => playSound('open'),
  close: () => playSound('close'),
  configure: configureSound,
  isSupported: isSoundSupported,
  dispose: disposeSound,
}
