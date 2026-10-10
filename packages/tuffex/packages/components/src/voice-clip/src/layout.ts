/**
 * Geometry and clock text for {@link TxVoiceClip}.
 *
 * The clip grows with its recording, as a chat voice message does, but on a square-root curve:
 * the first seconds widen it noticeably and a long recording approaches the cap slowly, so a
 * thread of short and long messages does not alternate between stubs and full-width bars.
 */

/** Width of a clip whose length is unknown or under a second. */
export const CLIP_MIN_WIDTH = 140

/** Width reached at {@link CLIP_FULL_WIDTH_MS} and kept beyond it. */
export const CLIP_MAX_WIDTH = 300

export const CLIP_FULL_WIDTH_MS = 60_000

/** One bar plus the gap after it. */
export const BAR_WIDTH = 3
export const BAR_GAP = 2

/**
 * Everything in the capsule that is not the waveform — inset, play key, the two gaps, the clock
 * and the end padding. Only the fallback for a first render with nothing measured yet: once
 * mounted, the bars count what the waveform's own box can hold.
 */
export const CLIP_CHROME_WIDTH = 90

/** Fewest bars a clip draws, however narrow its host squeezes it. */
export const MIN_BARS = 4

export function clipWidthFor(durationMs: number | undefined): number {
  if (!(typeof durationMs === 'number' && durationMs > 0))
    return CLIP_MIN_WIDTH
  const share = Math.sqrt(Math.min(durationMs, CLIP_FULL_WIDTH_MS) / CLIP_FULL_WIDTH_MS)
  return Math.round(CLIP_MIN_WIDTH + (CLIP_MAX_WIDTH - CLIP_MIN_WIDTH) * share)
}

export function barCountFor(waveWidth: number): number {
  if (!(waveWidth > 0))
    return MIN_BARS
  return Math.max(MIN_BARS, Math.floor((waveWidth + BAR_GAP) / (BAR_WIDTH + BAR_GAP)))
}

/** Whole seconds a length reads as: rounded, and never 0 for a recording that has any length. */
export function wholeSeconds(seconds: number): number {
  if (!(Number.isFinite(seconds) && seconds > 0))
    return 0
  return Math.max(1, Math.round(seconds))
}

/**
 * The countdown: the length as it reads at rest, less the whole seconds played. Counting down
 * from the rounded length means starting playback never changes the number on screen.
 */
export function remainingSeconds(total: number, position: number): number {
  const played = Number.isFinite(position) && position > 0 ? Math.floor(position + 1e-6) : 0
  return Math.max(0, wholeSeconds(total) - played)
}

/** `m:ss`, or `h:mm:ss` past an hour, for a count of whole seconds. */
export function formatClipTime(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, '0')
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
    : `${minutes}:${rest}`
}
