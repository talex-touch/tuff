/**
 * A short, quiet, speech-shaped recording for the VoiceClip demos, made in the page.
 *
 * Syllables are a soft vowel (a 160 Hz fundamental with decaying harmonics) shaped by an
 * attack/release envelope and separated by pauses, so the decoded waveform has the bursts and
 * gaps of a voice message without shipping an audio file. Seeded, so every visit draws the same
 * clip. 16 kHz mono 16-bit PCM in a WAV container — what the desktop app records.
 */

const SAMPLE_RATE = 16_000

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function syllableSamples(seconds: number, seed: number): Float32Array {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  const random = seeded(seed)
  let cursor = Math.round(0.12 * SAMPLE_RATE)
  while (cursor < samples.length) {
    const length = Math.round((0.12 + random() * 0.22) * SAMPLE_RATE)
    const loudness = 0.08 + random() * 0.14
    const pitch = 150 + random() * 40
    for (let index = 0; index < length && cursor + index < samples.length; index++) {
      const t = index / SAMPLE_RATE
      const envelope = Math.min(1, t / 0.03) * Math.min(1, (length - index) / (0.08 * SAMPLE_RATE))
      const phase = 2 * Math.PI * pitch * t
      const vowel = Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase)
      samples[cursor + index] = (vowel / 1.75) * loudness * envelope
    }
    // A short gap inside a word, a longer one between words.
    cursor += length + Math.round((random() < 0.3 ? 0.28 : 0.06) * SAMPLE_RATE)
  }
  return samples
}

function encodeWav(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++)
      view.setUint8(offset + index, value.charCodeAt(index))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let index = 0; index < samples.length; index++) {
    const value = Math.max(-1, Math.min(1, samples[index] ?? 0))
    view.setInt16(44 + index * 2, value * 0x7FFF, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export interface VoiceClipSample {
  src: string
  durationMs: number
}

/** An object URL the caller revokes with {@link releaseVoiceClipSample}. */
export function createVoiceClipSample(seconds: number, seed = 7): VoiceClipSample {
  const blob = encodeWav(syllableSamples(seconds, seed))
  return { src: URL.createObjectURL(blob), durationMs: Math.round(seconds * 1000) }
}

export function releaseVoiceClipSample(sample: VoiceClipSample | null | undefined): void {
  if (sample?.src)
    URL.revokeObjectURL(sample.src)
}
