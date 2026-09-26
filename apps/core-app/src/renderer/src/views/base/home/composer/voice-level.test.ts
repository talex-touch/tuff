import { describe, expect, it } from 'vitest'
import {
  createLevelNormalizer,
  LEVEL_FLOOR_WINDOW,
  LEVEL_GATE_MIN,
  LEVEL_REF_FLOOR
} from './voice-level'

/**
 * Levels measured on a MacBook's built-in microphone (2026-09-26): room tone 0.002–0.003, a voice
 * from the speakers 0.004–0.0066. The fixed gate this replaced (0.012) zeroed every one of them.
 */
const ROOM = [0.0025, 0.0028, 0.0022, 0.0031, 0.0026, 0.0029, 0.002, 0.003]

function feed(normalize: (rms: number) => number, frames: number[]): number[] {
  return frames.map((rms) => normalize(rms))
}

describe('createLevelNormalizer', () => {
  it('reads the room tone that opens a session as silence, from its first frame on', () => {
    const normalize = createLevelNormalizer()
    expect(feed(normalize, ROOM)).toEqual(ROOM.map(() => 0))
  })

  it('draws a quiet voice over that room as a clearly moving waveform, and its pauses flat', () => {
    const normalize = createLevelNormalizer()
    feed(normalize, ROOM)
    const speech = feed(normalize, [0.0055, 0.0066, 0.005, 0.0027, 0.008, 0.01, 0.0024])
    for (const index of [0, 1, 2, 4, 5]) expect(speech[index]).toBeGreaterThan(0.6)
    expect(speech[3]).toBe(0)
    expect(speech[6]).toBe(0)
    // Positive control: the fixed 0.012 gate this replaced would have drawn none of it.
    expect([0.0055, 0.0066, 0.005, 0.008, 0.01].every((rms) => rms < 0.012)).toBe(true)
  })

  it('keeps a long utterance readable: its pauses hold the floor down', () => {
    const normalize = createLevelNormalizer()
    feed(normalize, ROOM)
    // Ten seconds of speech with a breath every half second.
    for (let frame = 0; frame < 100; frame += 1) {
      const level = normalize(frame % 5 === 4 ? 0.0027 : 0.006)
      if (frame % 5 === 4) expect(level).toBe(0)
      else expect(level).toBeGreaterThan(0.6)
    }
  })

  it('learns a room that turns noisier once its quiet frames have left the window', () => {
    const normalize = createLevelNormalizer()
    feed(normalize, new Array<number>(LEVEL_FLOOR_WINDOW).fill(0.002))
    // A fan starts: it draws until the window no longer remembers the quiet room…
    expect(normalize(0.006)).toBeGreaterThan(0)
    const fan = feed(normalize, new Array<number>(LEVEL_FLOOR_WINDOW).fill(0.006))
    // …and is flat from then on, while a voice over it still draws.
    expect(fan.at(-1)).toBe(0)
    expect(normalize(0.02)).toBeGreaterThan(0.6)
  })

  it('never lets a frame under the absolute minimum through, however quiet the room', () => {
    const normalize = createLevelNormalizer()
    // A noise-suppressed capture: its silence sits far under any microphone's hiss.
    feed(normalize, [0.0001, 0.00008, 0.00012])
    expect(normalize(LEVEL_GATE_MIN * 0.9)).toBe(0)
    expect(normalize(0.02)).toBeGreaterThan(0.6)
  })

  it('reads an exact zero as silence, and does not let it pull the floor down', () => {
    const normalize = createLevelNormalizer()
    feed(normalize, ROOM)
    expect(normalize(0)).toBe(0)
    // Had the zero become the floor, the gate would have fallen to its minimum and let this in.
    expect(normalize(0.0026)).toBe(0)
  })

  it('reads a non-finite frame as silence', () => {
    const normalize = createLevelNormalizer()
    expect(normalize(Number.NaN)).toBe(0)
    expect(normalize(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('does not clip a shout, and lets a quiet voice read again within ~2s after a loud one', () => {
    const normalize = createLevelNormalizer()
    feed(normalize, ROOM)
    for (let frame = 0; frame < 5; frame += 1) expect(normalize(0.5)).toBeLessThanOrEqual(1)

    const loud = createLevelNormalizer()
    feed(loud, ROOM)
    feed(loud, new Array<number>(5).fill(0.05))
    // Right after the loud words the same quiet voice reads low…
    expect(loud(LEVEL_REF_FLOOR)).toBeLessThan(0.6)
    // …and back near full once the reference has fallen (17 frames = 1.7s).
    let level = 0
    for (let frame = 0; frame < 17; frame += 1) level = loud(LEVEL_REF_FLOOR)
    expect(level).toBeGreaterThan(0.85)
  })

  it('starts every session from the floor', () => {
    const first = createLevelNormalizer()
    feed(first, ROOM)
    feed(first, new Array<number>(5).fill(0.5))
    const next = createLevelNormalizer()
    feed(next, ROOM)
    expect(next(LEVEL_REF_FLOOR)).toBe(1)
  })
})
