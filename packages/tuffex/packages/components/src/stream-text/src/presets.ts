import type { StreamRevealPreset } from './types'

/**
 * How long each preset's entrance plays. The component writes the value as
 * `--tx-stream-reveal-duration`, which the shared keyframes read, and waits the
 * same time before it settles a word into plain text — one number for both.
 */
export const STREAM_REVEAL_DURATION_MS: Readonly<Record<StreamRevealPreset, number>> = {
  aurora: 460,
  hue: 180,
  blur: 420,
  languid: 900,
  none: 0,
}

export const STREAM_PACING_DEFAULTS = {
  wordMs: 24,
  maxLagMs: 600,
  drainMs: 320,
  pauseMs: 400,
} as const

export function streamRevealDuration(preset: StreamRevealPreset | undefined): number {
  return STREAM_REVEAL_DURATION_MS[preset ?? 'aurora'] ?? STREAM_REVEAL_DURATION_MS.aurora
}
