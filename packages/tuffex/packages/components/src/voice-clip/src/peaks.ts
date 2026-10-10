/**
 * Amplitudes for {@link TxVoiceClip}'s bars, decoded from the recording itself.
 *
 * Decoded once per URL and kept in a small LRU: a conversation re-renders its bubbles far more
 * often than it gains recordings, and every remount would otherwise fetch and decode the same
 * file again. The promise is cached, not the result, so two clips mounting on one URL share the
 * work. A failure is cached too — a `tfile:` that is gone stays gone — and drops out of the LRU
 * like any other entry.
 */

/** Buckets per decoded recording; resampled down (or up) to the bars that fit. */
export const PEAK_BUCKETS = 96

/** Recordings kept decoded. A long conversation evicts its oldest. */
export const PEAK_CACHE_SIZE = 24

/**
 * The rate the file is decoded at. Speech energy needs nothing like 44.1 kHz to draw 96 bars,
 * and decoding at 8 kHz holds a five-minute recording to 2.4M samples instead of 13M.
 */
const DECODE_SAMPLE_RATE = 8000

const cache = new Map<string, Promise<number[] | null>>()

type OfflineContextConstructor = new (channels: number, length: number, sampleRate: number) => {
  decodeAudioData: (data: ArrayBuffer) => Promise<AudioBuffer>
}

function offlineContext(): OfflineContextConstructor | undefined {
  const scope = globalThis as unknown as {
    OfflineAudioContext?: OfflineContextConstructor
    webkitOfflineAudioContext?: OfflineContextConstructor
  }
  return scope.OfflineAudioContext ?? scope.webkitOfflineAudioContext
}

/**
 * RMS per bucket, stretched so the quietest tenth of the recording reads as silence and the
 * loudest bucket as full height. Speech hovers well above zero between words — breath, room tone —
 * and on a plain 0–max scale every bar of a longer recording came out nearly as tall as the next.
 */
export function computePeaks(samples: Float32Array, buckets = PEAK_BUCKETS): number[] {
  const count = Math.max(1, Math.floor(buckets))
  if (samples.length === 0)
    return Array.from({ length: count }, () => 0)

  const energy: number[] = []
  for (let bucket = 0; bucket < count; bucket++) {
    const start = Math.floor((bucket * samples.length) / count)
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * samples.length) / count))
    let sum = 0
    for (let index = start; index < end && index < samples.length; index++) {
      const sample = samples[index] ?? 0
      sum += sample * sample
    }
    energy.push(Math.sqrt(sum / (end - start)))
  }

  const sorted = [...energy].sort((a, b) => a - b)
  const loudest = sorted[sorted.length - 1] ?? 0
  const floor = sorted[Math.floor((sorted.length - 1) * 0.1)] ?? 0
  if (!(loudest > floor))
    return energy.map(() => 0)
  return energy.map(value => Math.min(1, Math.max(0, (value - floor) / (loudest - floor))))
}

/**
 * `peaks` fitted to `bars` slots, each slot the mean of the values it covers (a slot narrower
 * than one value repeats it). The mean, not the loudest value: over half a second of speech the
 * loudest bucket is almost always a syllable, and taking it flattened every recording into a
 * block. Values are clamped to `0..1`; non-finite ones count as silence.
 */
export function resamplePeaks(peaks: readonly number[], bars: number): number[] {
  const count = Math.max(0, Math.floor(bars))
  if (count === 0)
    return []
  if (peaks.length === 0)
    return Array.from({ length: count }, () => 0)

  const out: number[] = []
  for (let bar = 0; bar < count; bar++) {
    const start = Math.floor((bar * peaks.length) / count)
    const end = Math.max(start + 1, Math.floor(((bar + 1) * peaks.length) / count))
    let sum = 0
    let taken = 0
    for (let index = start; index < end && index < peaks.length; index++) {
      const value = peaks[index] ?? 0
      sum += Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
      taken += 1
    }
    out.push(taken > 0 ? sum / taken : 0)
  }
  return out
}

/** Scales bars so the tallest fills the height; all-silent bars stay flat. */
export function fillPeaks(bars: readonly number[]): number[] {
  const tallest = Math.max(0, ...bars)
  return tallest > 0 ? bars.map(value => value / tallest) : bars.map(() => 0)
}

/**
 * Sources the clip may read a second time to draw its bars: bytes already on this machine. A
 * remote recording is not fetched again behind the host's back — network access in this library
 * goes through a client the host injects — so it draws flat unless the host passes `peaks`.
 */
const LOCAL_SOURCE = /^(?:blob|data|tfile|file):/i

export function canDecodeSource(src: string): boolean {
  return LOCAL_SOURCE.test(src)
}

async function decode(src: string): Promise<number[] | null> {
  const Context = offlineContext()
  if (!Context || typeof fetch !== 'function' || !canDecodeSource(src))
    return null
  try {
    // eslint-disable-next-line no-restricted-syntax -- reads a local recording (see LOCAL_SOURCE) the audio element is loading too; no network request.
    const response = await fetch(src)
    if (!response.ok)
      return null
    const data = await response.arrayBuffer()
    const audio = await new Context(1, 1, DECODE_SAMPLE_RATE).decodeAudioData(data)
    return computePeaks(audio.getChannelData(0))
  }
  catch {
    return null
  }
}

/** The recording's amplitudes, or `null` when it cannot be fetched or decoded. */
export function loadPeaks(src: string): Promise<number[] | null> {
  const cached = cache.get(src)
  if (cached) {
    // Most recently used goes last; the first key is the one to evict.
    cache.delete(src)
    cache.set(src, cached)
    return cached
  }

  const pending = decode(src)
  cache.set(src, pending)
  while (cache.size > PEAK_CACHE_SIZE) {
    const oldest = cache.keys().next().value
    if (oldest === undefined)
      break
    cache.delete(oldest)
  }
  return pending
}

/** Test seam: forget every decoded recording. */
export function clearPeakCache(): void {
  cache.clear()
}
