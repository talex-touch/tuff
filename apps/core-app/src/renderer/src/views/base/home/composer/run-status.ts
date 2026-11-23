import type { TxAiPartRunStep } from '@talex-touch/intelligence-uikit/utils'
import {
  calculateAiContextPercent,
  deriveAiRunStepFromParts,
  formatAiCompactElapsed,
  formatAiWindowText
} from '@talex-touch/intelligence-uikit/utils'

/**
 * What the run-status line above the composer says about the turn in flight.
 *
 * `thinking` carries the span's own first line (what the model is working through), `tool` the
 * call's name, `writing` means prose is being typed, and `waiting` is a turn with nothing yet.
 */
export type RunStep = TxAiPartRunStep

export const deriveRunStep = deriveAiRunStepFromParts

/** `44m 3s`, `3s`, `1h 2m` — whole units, the two largest, no leading zeros. */
export const formatElapsed = formatAiCompactElapsed

/** `1M`, `128k`, `950` — the window's own scale, one decimal only when it is not whole. */
export const formatWindow = formatAiWindowText

/**
 * The newest assistant turn the provider actually reported usage for.
 *
 * Usage arrives with a turn's `end`, so the reply still streaming has none yet. Reading the newest
 * message instead would blank the meter for the whole run and pop it back only at the end; the last
 * settled turn's figure is the last request that reported one, and it stays the reading while the
 * next turn runs.
 */
export function lastReportedTurn<T extends { role: string; status: string; meta?: unknown }>(
  messages: readonly T[]
): T['meta'] | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'assistant' && message.status !== 'streaming' && message.meta)
      return message.meta
  }
  return undefined
}

/**
 * Occupancy as a share of the window, clamped to 0–100. `null` when either figure is unknown:
 * a catalog or default window is never invented here, and an unreported usage is not zero.
 */
export function contextPercent(
  occupancy: number | undefined,
  window: number | undefined
): number | null {
  if (occupancy === undefined || window === undefined) return null
  if (!Number.isFinite(occupancy) || !Number.isFinite(window) || window <= 0 || occupancy < 0) {
    return null
  }
  return calculateAiContextPercent(occupancy, window)
}
