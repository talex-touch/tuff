/**
 * Auto-gain for the dictation capsule's waveform. The reference chase is the Assistant VoicePanel's
 * meter, lifted out so the composer does not import from that component; the gate is the composer's
 * own, relative to the room.
 *
 * Each frame is normalized against a reference that chases the recent peak — fast up so a shout
 * does not clip, slower down so the quiet words after it stay readable. Anything under the gate is
 * a hard zero, so room tone never reads as speech.
 *
 * The gate cannot be one absolute number. Measured on a MacBook's built-in microphone (2026-09-26):
 * room tone 0.002–0.003, a voice from the speakers peaking at 0.0066 — the VoicePanel's fixed 0.012
 * zeroed every frame and the waveform never moved. So the gate sits at twice the session's own
 * floor, with an absolute minimum under it.
 */

/** Under this a frame is silence whatever the room is like; the gate never drops below it. */
export const LEVEL_GATE_MIN = 0.002
/** A frame reads as sound only once it is this many times the room's floor. */
export const LEVEL_GATE_RATIO = 2
/**
 * The floor is the quietest frame of the last 50 (5s at the ≈10 Hz level rate). A minimum follows
 * a quieter room at once and rises only after a whole window without a quiet frame, so speech — which
 * breathes and pauses — cannot drag it up to its own level; a room that turns noisier is learned
 * within the window. The voice contract's trailing-silence floor makes the same choice for the same
 * reason (`voice-session-contracts.md` › Capture signal chain): an average would have to decide
 * whether to keep adapting while someone speaks. Longer than that floor's 3s, because a 100ms level
 * frame smooths over the gaps between syllables that its 10ms windows still see.
 */
export const LEVEL_FLOOR_WINDOW = 50
/** Speech at 0.005–0.01 from a built-in microphone already fills most of the meter. */
export const LEVEL_REF_FLOOR = 0.01
export const LEVEL_REF_ATTACK = 0.6
/** At 10 Hz a loud voice's reference (0.05) falls back near the floor in about 1.7s. */
export const LEVEL_REF_RELEASE = 0.15

/**
 * A per-session normalizer: `rms` (0..1) in, 0..1 out. A new session starts from the reference floor
 * and learns its room from its own frames — the current one included, so the room tone that opens a
 * capture is gated from its first frame. An exact zero is digital silence (a capture still opening,
 * a dropout), not room tone: it reads as silence and never becomes the floor.
 */
export function createLevelNormalizer(): (rms: number) => number {
  let reference = LEVEL_REF_FLOOR
  const recent: number[] = []

  return (rms) => {
    if (!Number.isFinite(rms) || rms <= 0) return 0
    recent.push(rms)
    if (recent.length > LEVEL_FLOOR_WINDOW) recent.shift()
    const floor = Math.min(...recent)
    if (rms < Math.max(LEVEL_GATE_MIN, floor * LEVEL_GATE_RATIO)) return 0

    const rate = rms > reference ? LEVEL_REF_ATTACK : LEVEL_REF_RELEASE
    reference = Math.max(LEVEL_REF_FLOOR, reference + (rms - reference) * rate)
    // Square root, not linear: loudness is perceptual, and the interesting detail lives low.
    return Math.min(1, Math.sqrt(rms / reference))
  }
}
