import type { VueWrapper } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import * as sass from 'sass'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { TxVoiceClip } from '../index'
import {
  barCountFor,
  CLIP_MAX_WIDTH,
  CLIP_MIN_WIDTH,
  clipWidthFor,
  formatClipTime,
  MIN_BARS,
  remainingSeconds,
  wholeSeconds,
} from '../src/layout'
import { clearPeakCache, computePeaks, fillPeaks, loadPeaks, PEAK_CACHE_SIZE, resamplePeaks } from '../src/peaks'
import { currentPlaybackOwner } from '../src/playback'

enableAutoUnmount(afterEach)

// ── A media element jsdom can drive ─────────────────────────────────────────
//
// jsdom has no media pipeline: `play()` / `pause()` are unimplemented and `duration` is NaN.
// This keeps per-element state and fires the events a browser fires, in the browser's order
// (`pause` before `ended` at the end of the file).

interface FakeMedia {
  currentTime: number
  duration: number
  paused: boolean
  ended: boolean
}

const media = new WeakMap<HTMLMediaElement, FakeMedia>()
const proto = HTMLMediaElement.prototype
const originals = {
  play: proto.play,
  pause: proto.pause,
  currentTime: Object.getOwnPropertyDescriptor(proto, 'currentTime'),
  duration: Object.getOwnPropertyDescriptor(proto, 'duration'),
  paused: Object.getOwnPropertyDescriptor(proto, 'paused'),
  ended: Object.getOwnPropertyDescriptor(proto, 'ended'),
}

function stateOf(element: HTMLMediaElement): FakeMedia {
  let state = media.get(element)
  if (!state) {
    state = { currentTime: 0, duration: Number.NaN, paused: true, ended: false }
    media.set(element, state)
  }
  return state
}

let playImpl: (element: HTMLMediaElement) => Promise<void>

beforeAll(() => {
  Object.defineProperty(proto, 'currentTime', {
    configurable: true,
    get(this: HTMLMediaElement) { return stateOf(this).currentTime },
    set(this: HTMLMediaElement, value: number) {
      const state = stateOf(this)
      state.currentTime = value
      state.ended = false
    },
  })
  Object.defineProperty(proto, 'duration', {
    configurable: true,
    get(this: HTMLMediaElement) { return stateOf(this).duration },
  })
  Object.defineProperty(proto, 'paused', {
    configurable: true,
    get(this: HTMLMediaElement) { return stateOf(this).paused },
  })
  Object.defineProperty(proto, 'ended', {
    configurable: true,
    get(this: HTMLMediaElement) { return stateOf(this).ended },
  })
  proto.play = function play(this: HTMLMediaElement) {
    return playImpl(this)
  }
  proto.pause = function pause(this: HTMLMediaElement) {
    const state = stateOf(this)
    if (state.paused)
      return
    state.paused = true
    this.dispatchEvent(new Event('pause'))
  }
})

afterAll(() => {
  proto.play = originals.play
  proto.pause = originals.pause
  for (const key of ['currentTime', 'duration', 'paused', 'ended'] as const) {
    const descriptor = originals[key]
    if (descriptor)
      Object.defineProperty(proto, key, descriptor)
    else
      delete (proto as unknown as Record<string, unknown>)[key]
  }
})

function defaultPlay(element: HTMLMediaElement): Promise<void> {
  const state = stateOf(element)
  if (state.paused) {
    state.paused = false
    state.ended = false
    element.dispatchEvent(new Event('play'))
  }
  return Promise.resolve()
}

function loadMetadata(element: HTMLMediaElement, seconds: number): void {
  stateOf(element).duration = seconds
  element.dispatchEvent(new Event('loadedmetadata'))
}

function playToEnd(element: HTMLMediaElement): void {
  const state = stateOf(element)
  state.currentTime = state.duration
  state.paused = true
  element.dispatchEvent(new Event('pause'))
  state.ended = true
  element.dispatchEvent(new Event('ended'))
}

// ── Frames, fetch and decoding ─────────────────────────────────────────────

let frames: FrameRequestCallback[] = []

function runFrame(): void {
  const due = frames
  frames = []
  for (const callback of due)
    callback(performance.now())
}

let fetchMock: ReturnType<typeof vi.fn>
let decodeMock: ReturnType<typeof vi.fn>

function speechLikeSamples(length = 8000): Float32Array {
  const samples = new Float32Array(length)
  for (let index = 0; index < length; index++) {
    // Two loud syllables over a quiet floor.
    const t = index / length
    const loud = (t > 0.1 && t < 0.3) || (t > 0.55 && t < 0.8)
    samples[index] = Math.sin(index / 3) * (loud ? 0.8 : 0.02)
  }
  return samples
}

beforeEach(() => {
  playImpl = defaultPlay
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  clearPeakCache()
  fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
  decodeMock = vi.fn(async () => ({ getChannelData: () => speechLikeSamples() }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('OfflineAudioContext', class {
    decodeAudioData = decodeMock
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── Helpers ────────────────────────────────────────────────────────────────

type ClipWrapper = VueWrapper<InstanceType<typeof TxVoiceClip>>

function mountClip(props: Record<string, unknown> = {}): ClipWrapper {
  return mount(TxVoiceClip, {
    props: { src: 'blob:app://voice/a', durationMs: 5600, ...props },
    attachTo: document.body,
  }) as ClipWrapper
}

function audioOf(wrapper: ClipWrapper): HTMLAudioElement {
  return wrapper.find('audio').element as HTMLAudioElement
}

function slider(wrapper: ClipWrapper) {
  return wrapper.find('[role="slider"]')
}

function progressOf(wrapper: ClipWrapper): number {
  return Number((wrapper.element as HTMLElement).style.getPropertyValue('--tx-voice-clip-progress'))
}

function barLevels(wrapper: ClipWrapper): number[] {
  return wrapper
    .findAll('.tx-voice-clip__bars:not(.tx-voice-clip__bars--played) .tx-voice-clip__bar')
    .map(bar => Number((bar.element as HTMLElement).style.getPropertyValue('--tx-voice-clip-level')))
}

// ── Pure helpers ───────────────────────────────────────────────────────────

describe('layout', () => {
  it('formats whole seconds as m:ss, and h:mm:ss past an hour', () => {
    expect(formatClipTime(0)).toBe('0:00')
    expect(formatClipTime(5.9)).toBe('0:05')
    expect(formatClipTime(65)).toBe('1:05')
    expect(formatClipTime(3725)).toBe('1:02:05')
    expect(formatClipTime(Number.NaN)).toBe('0:00')
  })

  it('reads a length rounded, and never as zero when there is one', () => {
    expect(wholeSeconds(3.2)).toBe(3)
    expect(wholeSeconds(3.5)).toBe(4)
    expect(wholeSeconds(0.3)).toBe(1)
    expect(wholeSeconds(0)).toBe(0)
  })

  it('counts down from the rounded length, so starting playback keeps the number', () => {
    expect(remainingSeconds(3.4, 0)).toBe(wholeSeconds(3.4))
    expect(remainingSeconds(3.6, 0)).toBe(wholeSeconds(3.6))
    expect(remainingSeconds(5.6, 2.2)).toBe(4)
    expect(remainingSeconds(5.6, 5.6)).toBe(1)
    expect(remainingSeconds(3.2, 3.2)).toBe(0)
  })

  it('widens with the recording on a square-root curve, between the two caps', () => {
    expect(clipWidthFor(undefined)).toBe(CLIP_MIN_WIDTH)
    expect(clipWidthFor(0)).toBe(CLIP_MIN_WIDTH)
    const short = clipWidthFor(2000)
    const medium = clipWidthFor(15_000)
    const long = clipWidthFor(60_000)
    expect(short).toBeGreaterThan(CLIP_MIN_WIDTH)
    expect(medium).toBeGreaterThan(short)
    expect(long).toBe(CLIP_MAX_WIDTH)
    expect(clipWidthFor(300_000)).toBe(CLIP_MAX_WIDTH)
  })

  it('fits whole bars into the waveform box and never fewer than the minimum', () => {
    expect(barCountFor(0)).toBe(MIN_BARS)
    expect(barCountFor(48)).toBe(10)
    expect(barCountFor(208)).toBe(42)
  })
})

describe('peaks', () => {
  it('stretches bucket energy from the quietest tenth to the loudest bucket', () => {
    const peaks = computePeaks(speechLikeSamples(9600), 20)
    expect(peaks).toHaveLength(20)
    expect(Math.max(...peaks)).toBeCloseTo(1, 5)
    // The room tone between syllables reads as silence, not as a short bar.
    expect(peaks.filter(value => value === 0).length).toBeGreaterThanOrEqual(2)
  })

  it('reads silence as a flat track', () => {
    expect(computePeaks(new Float32Array(100), 4)).toEqual([0, 0, 0, 0])
    expect(computePeaks(new Float32Array(0), 3)).toEqual([0, 0, 0])
  })

  it('resamples each slot to the mean of the values it covers', () => {
    expect(resamplePeaks([0.1, 0.9, 0.2, 0.4], 2)).toEqual([0.5, 0.30000000000000004])
    expect(resamplePeaks([0.5], 3)).toEqual([0.5, 0.5, 0.5])
    expect(resamplePeaks([], 2)).toEqual([0, 0])
    expect(resamplePeaks([2, Number.NaN], 2)).toEqual([1, 0])
  })

  it('fills the height from the tallest bar, leaving silence flat', () => {
    expect(fillPeaks([0.2, 0.5, 0.25])).toEqual([0.4, 1, 0.5])
    expect(fillPeaks([0, 0])).toEqual([0, 0])
  })

  it('decodes a URL once and shares the result', async () => {
    const [first, second] = await Promise.all([loadPeaks('blob:one'), loadPeaks('blob:one')])
    expect(first).toBe(second)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('evicts the least recently used recording past the cache size', async () => {
    await loadPeaks('blob:keep')
    for (let index = 0; index < PEAK_CACHE_SIZE - 1; index++)
      await loadPeaks(`blob:filler-${index}`)
    // Touching it makes it the most recent; the next new URL evicts filler-0 instead.
    await loadPeaks('blob:keep')
    await loadPeaks('blob:new')
    fetchMock.mockClear()
    await loadPeaks('blob:keep')
    expect(fetchMock).not.toHaveBeenCalled()
    await loadPeaks('blob:filler-0')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('answers null, not an error, when the recording cannot be fetched or decoded', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })
    expect(await loadPeaks('blob:missing')).toBeNull()
    decodeMock.mockRejectedValueOnce(new Error('EncodingError'))
    expect(await loadPeaks('blob:garbled')).toBeNull()
  })

  it('reads local recordings only, never a remote one a second time', async () => {
    expect(await loadPeaks('https://cdn.example.com/voice.wav')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    await loadPeaks('tfile:///tmp/voice.wav')
    await loadPeaks('data:audio/wav;base64,UklGRg==')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

// ── Component ──────────────────────────────────────────────────────────────

describe('TxVoiceClip', () => {
  it('renders a play key, a slider and the length it was given', () => {
    const wrapper = mountClip()
    const toggle = wrapper.find('button')
    expect(toggle.attributes('aria-label')).toBe('Play voice message')
    expect(toggle.attributes('disabled')).toBeUndefined()
    expect(slider(wrapper).attributes()).toMatchObject({
      'aria-label': 'Playback position',
      'aria-valuemin': '0',
      'aria-valuemax': '5.6',
      'aria-valuenow': '0',
      'aria-valuetext': '0:00 / 0:06',
      'tabindex': '0',
    })
    expect(wrapper.find('.tx-voice-clip__time').text()).toBe('0:06')
    expect((wrapper.element as HTMLElement).style.width).toBe(`${clipWidthFor(5600)}px`)
  })

  it('prefers the element duration once it has one', async () => {
    const wrapper = mountClip({ durationMs: undefined })
    expect(wrapper.find('.tx-voice-clip__time').text()).toBe('')
    loadMetadata(audioOf(wrapper), 12.2)
    await nextTick()
    expect(wrapper.find('.tx-voice-clip__time').text()).toBe('0:12')
    expect(slider(wrapper).attributes('aria-valuemax')).toBe('12.2')
  })

  it('is unavailable without a source: disabled key, the note, no slider', () => {
    const wrapper = mountClip({ src: '', unavailableLabel: '录音不可用' })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.tx-voice-clip__note').text()).toBe('录音不可用')
    expect(slider(wrapper).exists()).toBe(false)
    expect(wrapper.classes()).toContain('is-unavailable')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('plays and pauses from the key, emitting both and swapping its label', async () => {
    const wrapper = mountClip({ pauseLabel: '暂停语音' })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('play')).toHaveLength(1)
    expect(wrapper.classes()).toContain('is-playing')
    expect(wrapper.find('button').attributes('aria-label')).toBe('暂停语音')

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('pause')).toHaveLength(1)
    expect(wrapper.classes()).not.toContain('is-playing')
    expect(currentPlaybackOwner()).toBeNull()
  })

  it('counts down while playing and moves the played layer every frame', async () => {
    const wrapper = mountClip()
    const audio = audioOf(wrapper)
    loadMetadata(audio, 5.6)
    await wrapper.vm.play()
    await nextTick()
    stateOf(audio).currentTime = 2.2
    runFrame()
    await nextTick()
    expect(progressOf(wrapper)).toBeCloseTo(2.2 / 5.6, 5)
    // The 0:06 at rest, less the two whole seconds played.
    expect(wrapper.find('.tx-voice-clip__time').text()).toBe('0:04')
    expect(slider(wrapper).attributes('aria-valuenow')).toBe('2.2')
    expect(slider(wrapper).attributes('aria-valuetext')).toBe('0:02 / 0:06')
  })

  it('keeps counting on the element clock when frames stall', async () => {
    const wrapper = mountClip()
    const audio = audioOf(wrapper)
    loadMetadata(audio, 5.6)
    await wrapper.vm.play()
    stateOf(audio).currentTime = 3.1
    // No frame runs: a throttled window. The element's own timeupdate still arrives.
    audio.dispatchEvent(new Event('timeupdate'))
    await nextTick()
    expect(wrapper.find('.tx-voice-clip__time').text()).toBe('0:03')
    expect(progressOf(wrapper)).toBeCloseTo(3.1 / 5.6, 5)
  })

  it('pauses whichever clip was playing when another starts', async () => {
    const first = mountClip({ src: 'blob:app://voice/first' })
    const second = mountClip({ src: 'blob:app://voice/second' })
    await first.vm.play()
    await nextTick()
    expect(first.classes()).toContain('is-playing')

    await second.vm.play()
    await nextTick()
    expect(first.emitted('pause')).toHaveLength(1)
    expect(first.classes()).not.toContain('is-playing')
    expect(second.classes()).toContain('is-playing')
  })

  it('resets to the start when the recording ends', async () => {
    const wrapper = mountClip()
    const audio = audioOf(wrapper)
    loadMetadata(audio, 5.6)
    await wrapper.vm.play()
    stateOf(audio).currentTime = 3
    runFrame()
    playToEnd(audio)
    await nextTick()
    expect(wrapper.emitted('ended')).toHaveLength(1)
    expect(audio.currentTime).toBe(0)
    expect(progressOf(wrapper)).toBe(0)
    expect(wrapper.find('.tx-voice-clip__time').text()).toBe('0:06')
    expect(currentPlaybackOwner()).toBeNull()
  })

  it('starts over when played again from the end', async () => {
    const wrapper = mountClip()
    const audio = audioOf(wrapper)
    loadMetadata(audio, 5.6)
    stateOf(audio).currentTime = 5.6
    await wrapper.vm.play()
    expect(audio.currentTime).toBe(0)
  })

  it('steps with the arrow keys and jumps with Home, End and the page keys', async () => {
    const wrapper = mountClip({ durationMs: 20_000 })
    const audio = audioOf(wrapper)
    const target = slider(wrapper)

    await target.trigger('keydown', { key: 'ArrowRight' })
    expect(audio.currentTime).toBe(1)
    await target.trigger('keydown', { key: 'ArrowUp' })
    expect(audio.currentTime).toBe(2)
    await target.trigger('keydown', { key: 'ArrowLeft' })
    expect(audio.currentTime).toBe(1)
    await target.trigger('keydown', { key: 'PageUp' })
    expect(audio.currentTime).toBe(3)
    await target.trigger('keydown', { key: 'End' })
    expect(audio.currentTime).toBe(20)
    expect(target.attributes('aria-valuenow')).toBe('20')
    expect(progressOf(wrapper)).toBe(1)
    await target.trigger('keydown', { key: 'Home' })
    expect(audio.currentTime).toBe(0)
    await target.trigger('keydown', { key: 'ArrowLeft' })
    expect(audio.currentTime).toBe(0)
  })

  it('seeks where the waveform is pressed and follows a drag', async () => {
    const wrapper = mountClip({ durationMs: 10_000 })
    const audio = audioOf(wrapper)
    const wave = slider(wrapper).element as HTMLElement
    wave.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 36, right: 300, bottom: 36, x: 100, y: 0, toJSON: () => ({}) })

    await slider(wrapper).trigger('pointerdown', { button: 0, clientX: 200, pointerId: 1 })
    expect(audio.currentTime).toBe(5)
    expect(progressOf(wrapper)).toBeCloseTo(0.5, 5)
    expect(document.activeElement).toBe(wave)

    await slider(wrapper).trigger('pointermove', { clientX: 250, pointerId: 1 })
    expect(audio.currentTime).toBe(7.5)
    await slider(wrapper).trigger('pointerup', { clientX: 250, pointerId: 1 })
    await slider(wrapper).trigger('pointermove', { clientX: 120, pointerId: 1 })
    expect(audio.currentTime).toBe(7.5)
  })

  it('draws the peaks it is given', () => {
    const wrapper = mountClip({ peaks: [0, 1, 0.5] })
    const levels = barLevels(wrapper)
    expect(levels.length).toBeGreaterThanOrEqual(MIN_BARS)
    expect(Math.max(...levels)).toBe(1)
    expect(wrapper.classes()).not.toContain('is-flat')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('decodes its own peaks when none are given, flat until they land', async () => {
    const wrapper = mountClip()
    expect(wrapper.classes()).toContain('is-flat')
    expect(new Set(barLevels(wrapper))).toEqual(new Set([0]))
    await flushPromises()
    expect(wrapper.classes()).not.toContain('is-flat')
    expect(Math.max(...barLevels(wrapper))).toBeCloseTo(1, 5)
    expect(fetchMock).toHaveBeenCalledWith('blob:app://voice/a')
  })

  it('stays flat and quiet when decoding fails', async () => {
    decodeMock.mockRejectedValueOnce(new Error('EncodingError'))
    const wrapper = mountClip()
    await flushPromises()
    expect(new Set(barLevels(wrapper))).toEqual(new Set([0]))
    expect(wrapper.emitted('error')).toBeUndefined()
  })

  it('turns unavailable and reports a source the element cannot load', async () => {
    const wrapper = mountClip()
    audioOf(wrapper).dispatchEvent(new Event('error'))
    await nextTick()
    expect(wrapper.emitted('error')).toHaveLength(1)
    expect(wrapper.find('.tx-voice-clip__note').text()).toBe('Recording unavailable')
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('reports a refused start but not an interrupted one', async () => {
    const wrapper = mountClip()
    playImpl = () => Promise.reject(new DOMException('Interrupted', 'AbortError'))
    await wrapper.vm.play()
    expect(wrapper.emitted('error')).toBeUndefined()
    playImpl = () => Promise.reject(new DOMException('No user gesture', 'NotAllowedError'))
    await wrapper.vm.play()
    expect(wrapper.emitted('error')).toHaveLength(1)
  })

  it('takes no input while disabled, and pauses when disabled mid-play', async () => {
    const wrapper = mountClip()
    await wrapper.vm.play()
    await nextTick()
    await wrapper.setProps({ disabled: true })
    expect(wrapper.emitted('pause')).toHaveLength(1)
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(slider(wrapper).attributes('aria-disabled')).toBe('true')
    expect(slider(wrapper).attributes('tabindex')).toBe('-1')
    await slider(wrapper).trigger('keydown', { key: 'End' })
    expect(audioOf(wrapper).currentTime).toBe(0)
  })

  it('resets when the source changes', async () => {
    const wrapper = mountClip()
    const audio = audioOf(wrapper)
    loadMetadata(audio, 5.6)
    await wrapper.vm.play()
    stateOf(audio).currentTime = 3
    runFrame()
    await wrapper.setProps({ src: 'blob:app://voice/b', durationMs: 2000 })
    expect(wrapper.classes()).not.toContain('is-playing')
    expect(progressOf(wrapper)).toBe(0)
    expect(wrapper.find('.tx-voice-clip__time').text()).toBe('0:02')
    expect(currentPlaybackOwner()).toBeNull()
  })

  it('stops and gives up the playback slot on unmount', async () => {
    const wrapper = mountClip()
    const audio = audioOf(wrapper)
    await wrapper.vm.play()
    expect(currentPlaybackOwner()).not.toBeNull()
    wrapper.unmount()
    expect(stateOf(audio).paused).toBe(true)
    expect(currentPlaybackOwner()).toBeNull()
  })
})

// ── Style contract ─────────────────────────────────────────────────────────

describe('TxVoiceClip styles', () => {
  const sfc = resolve(dirname(fileURLToPath(import.meta.url)), '../src/TxVoiceClip.vue')

  function compiled(): string {
    const source = readFileSync(sfc, 'utf8')
    const blocks = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1] ?? '')
    expect(blocks.length).toBe(1)
    return sass.compileString(blocks[0]!, { url: pathToFileURL(sfc), syntax: 'scss' }).css
  }

  it('declares motion only for readers who have not asked for less', () => {
    const css = compiled()
    const motionStart = css.indexOf('@media (prefers-reduced-motion: no-preference)')
    expect(motionStart).toBeGreaterThan(-1)
    const before = css.slice(0, motionStart)
    expect(before).not.toMatch(/transition|animation/)
  })

  it('never eases a colour', () => {
    expect(compiled()).not.toMatch(/transition[^;]*(color|background)/)
  })
})
