import type { AiMessagePart } from '@talex-touch/tuffex/ai-elements'

/**
 * What the run-status line above the composer says about the turn in flight.
 *
 * `thinking` carries the span's own first line (what the model is working through), `tool` the
 * call's name, `writing` means prose is being typed, and `waiting` is a turn with nothing yet.
 */
export type RunStep =
  | { kind: 'waiting' }
  | { kind: 'thinking'; title?: string }
  | { kind: 'tool'; name: string; summary?: string }
  | { kind: 'writing' }

const TITLE_LIMIT = 64

function firstLine(text: string): string {
  const line = text.split('\n').find((candidate) => candidate.trim()) ?? ''
  // Models head their thoughts with `**Planning …**`; the line renders as plain text.
  const plain = line
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/, '')
    .trim()
  return plain.length > TITLE_LIMIT ? `${plain.slice(0, TITLE_LIMIT - 1)}…` : plain
}

/**
 * The step the turn is on, read off the tail of its parts: the last part that is still live decides.
 * A tool that is pending or running wins over everything before it; otherwise the last non-empty
 * part does. Attachment and source parts are not progress and are skipped.
 */
export function deriveRunStep(parts: readonly AiMessagePart[] | undefined): RunStep {
  if (!parts) return { kind: 'waiting' }
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part.type === 'tool-call') {
      if (part.status === 'pending' || part.status === 'running') {
        return { kind: 'tool', name: part.name, summary: part.summary }
      }
      // A settled call is history: what follows it (or nothing) is the current step.
      return { kind: 'thinking' }
    }
    if (part.type === 'reasoning') {
      const title = firstLine(part.text)
      return title ? { kind: 'thinking', title } : { kind: 'thinking' }
    }
    if (part.type === 'text' && part.text) return { kind: 'writing' }
  }
  return { kind: 'waiting' }
}

/** `44m 3s`, `3s`, `1h 2m` — whole units, the two largest, no leading zeros. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${rest}s`
  return `${rest}s`
}

/** `1M`, `128k`, `950` — the window's own scale, one decimal only when it is not whole. */
export function formatWindow(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return ''
  const scale = (value: number, unit: string): string => {
    const rounded = Math.round(value * 10) / 10
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}${unit}`
  }
  if (tokens >= 1_000_000) return scale(tokens / 1_000_000, 'M')
  if (tokens >= 1_000) return scale(tokens / 1_000, 'k')
  return `${Math.round(tokens)}`
}

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
  return Math.min(100, Math.round((occupancy / window) * 100))
}
