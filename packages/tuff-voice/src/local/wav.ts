/**
 * Minimal RIFF/WAVE writing.
 *
 * Engines here are file-oriented — whisper.cpp's CLI takes flac/mp3/ogg/wav and
 * nothing else. A live microphone hands us headerless 16-bit PCM, so the runtime has
 * to produce the container itself. Doing it in-process avoids making ffmpeg a hard
 * dependency of dictation: a user who never installed a media toolchain can still
 * speak into Tuff.
 */

/** Canonical 44-byte RIFF/WAVE header: RIFF, fmt (16), data. */
export const WAV_HEADER_BYTES = 44

export interface WavFormat {
  sampleRate: number
  channels: 1 | 2
  bitsPerSample?: 16 | 24 | 32
}

/** Byte rate and block align are derived, never passed in — mismatched values make a file unreadable. */
export function buildWavHeader(dataBytes: number, format: WavFormat): Buffer {
  const bitsPerSample = format.bitsPerSample ?? 16
  const blockAlign = format.channels * (bitsPerSample / 8)
  const header = Buffer.alloc(WAV_HEADER_BYTES)

  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(format.channels, 22)
  header.writeUInt32LE(format.sampleRate, 24)
  header.writeUInt32LE(format.sampleRate * blockAlign, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataBytes, 40)

  return header
}

/** Header + payload as one buffer. Copies once; callers that stream should write the header first. */
export function wrapPcmAsWav(pcm: Uint8Array, format: WavFormat): Buffer {
  return Buffer.concat([buildWavHeader(pcm.byteLength, format), Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)])
}

/** Playback length of a payload, for usage accounting and progress. */
export function pcmDurationMs(pcmBytes: number, format: WavFormat): number {
  const bitsPerSample = format.bitsPerSample ?? 16
  const blockAlign = format.channels * (bitsPerSample / 8)
  if (blockAlign <= 0 || format.sampleRate <= 0) return 0
  return Math.round((pcmBytes / blockAlign / format.sampleRate) * 1000)
}