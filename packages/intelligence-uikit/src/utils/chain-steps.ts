import type { TxAiSegment } from '../types'
import type {
  AiChainStep,
  AiMessagePart,
  AiReasoningPart,
  AiToolCallPart,
} from '@talex-touch/tuffex/ai-elements'

/** Trimmed so a step title stays one readable line. */
const TITLE_LIMIT = 48

/**
 * What a turn that ends stores on a call that never answered. It persists with the thread, so it is
 * a code rather than wording, and it stays the English word it has always been so threads saved
 * before the card localized it read the same way.
 */
export const INTERRUPTED_TOOL_CALL_ERROR = 'Interrupted'

function firstLine(text: string): string {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > TITLE_LIMIT ? `${line.slice(0, TITLE_LIMIT)}…` : line
}

/**
 * Step titles render as plain text in the trail header, so the emphasis
 * markers models like to head their thoughts with (`**Planning …**`) would
 * show as literal asterisks.
 */
function plainTitle(text: string): string {
  return firstLine(text)
    .replace(/[*_`#]+/g, '')
    .trim()
}

/**
 * The title line already heads the step — the body picks up after it. Except
 * when the title had to truncate: then it is only a preview, and the body
 * must carry the full text or the tail of that first line renders nowhere.
 */
function bodyFor(text: string): string | undefined {
  const index = text.indexOf('\n')
  const first = (index === -1 ? text : text.slice(0, index)).trim()
  if (first.length > TITLE_LIMIT)
    return text.trim() || undefined
  const rest = index === -1 ? '' : text.slice(index + 1).trim()
  return rest || text.trim() || undefined
}


/**
 * Wording the host owns. A span's title heads its own block now, so a
 * hard-coded English fallback would surface as a header in a localized UI.
 */
export interface SegmentLabels {
  /** Header for a span whose text has not arrived yet. */
  thinking?: string
  /** Header for a settled span, given its thinking time formatted, e.g. `10.8s`. */
  thinkingFor?: (time: string) => string
  /** Alert text for a call the turn ended without ever answering. */
  interrupted?: string
  /**
   * Alert text for a call that failed, from the error it stored. The error persists with the thread
   * as the agent read it, so it is worded when the card renders.
   */
  toolError?: (error: string) => string
}

function formatThinkingTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function toReasoningStep(
  part: AiReasoningPart,
  index: number,
  streaming: boolean,
  labels: SegmentLabels,
): AiChainStep {
  const settled = part.done || !streaming
  const text = part.text
  const newlineIndex = text.indexOf('\n')
  const hasNewline = newlineIndex !== -1
  const first = (hasNewline ? text.slice(0, newlineIndex) : text).trim()
  const hasRecognizedTitle = hasNewline && first.length > 0 && first.length <= TITLE_LIMIT

  if (settled && part.durationMs !== undefined && labels.thinkingFor) {
    return {
      id: `reasoning-${index}`,
      kind: 'thinking',
      title: labels.thinkingFor(formatThinkingTime(part.durationMs)),
      body: text.trim() || undefined,
      status: 'done',
    }
  }

  let title: string
  let body: string | undefined

  if (hasRecognizedTitle) {
    title = plainTitle(first) || labels.thinking || 'Thinking'
    const rest = text.slice(newlineIndex + 1).trim()
    body = rest || text.trim() || undefined
  }
  else if (!hasNewline && streaming && !part.done) {
    // Before a newline arrives during streaming, no title is recognized yet:
    // show the dynamic verb and stream the content directly into body.
    title = labels.thinking || 'Thinking'
    body = text.trim() || undefined
  }
  else {
    title = plainTitle(text) || labels.thinking || 'Thinking'
    body = bodyFor(text)
  }

  return {
    id: `reasoning-${index}`,
    kind: 'thinking',
    title,
    body,
    status: settled ? 'done' : 'active',
    durationMs: part.durationMs,
  }
}

/**
 * A call still pending or running once the turn has settled never came back —
 * the card renders straight from `status`, so left alone it would spin for the
 * life of the thread. One the turn already marked interrupted carries
 * `INTERRUPTED_TOOL_CALL_ERROR`, which the label words for the reader, and a
 * failed call's stored error is worded by `toolError`.
 *
 * The original part is returned whenever nothing needs correcting: callers
 * write back to it (a submitted form marks itself on the part so the answer
 * persists with the thread), and a copy would swallow that write. Only an
 * interrupted or failed call allocates, and a form can never be one — a form
 * part is only ever rendered once its call is `done`.
 */
function settledToolPart(
  part: AiToolCallPart,
  streaming: boolean,
  labels: SegmentLabels,
): AiToolCallPart {
  if (part.status === 'error' && part.error === INTERRUPTED_TOOL_CALL_ERROR) {
    return labels.interrupted ? { ...part, error: labels.interrupted } : part
  }
  if (part.status === 'error' && part.error && labels.toolError) {
    const error = labels.toolError(part.error)
    return error === part.error ? part : { ...part, error }
  }
  if (streaming || part.status === 'done' || part.status === 'error')
    return part
  // The card renders `error` as its alert text; without a fallback an
  // interrupted call would show an empty red block.
  return { ...part, status: 'error', error: part.error ?? labels.interrupted }
}

/**
 * Splits a message's parts into the sequence the body renders.
 *
 * Each reasoning span becomes its own segment rather than joining one trail
 * per turn: the accumulator opens a fresh part per span, so "think, call,
 * think" is three parts and reads as three units. Prose is carried the same
 * way, which is what lets a turn that answers between two thoughts render in
 * that order.
 */
export function toMessageSegments(
  parts: AiMessagePart[] | undefined,
  streaming: boolean,
  labels: SegmentLabels = {},
): TxAiSegment[] {
  if (!parts)
    return []

  const segments: TxAiSegment[] = []
  const lastIndex = parts.length - 1

  for (const [index, part] of parts.entries()) {
    if (part.type === 'reasoning') {
      segments.push({
        kind: 'reasoning',
        id: `reasoning-${index}`,
        step: toReasoningStep(part, index, streaming, labels),
      })
      continue
    }

    if (part.type === 'tool-call') {
      segments.push({
        kind: 'tool',
        id: part.id,
        part: settledToolPart(part, streaming, labels),
      })
      continue
    }

    if (part.type === 'text') {
      // An empty part is the accumulator mid-rollback, not a paragraph.
      if (!part.text)
        continue
      segments.push({
        kind: 'text',
        id: `text-${index}`,
        text: part.text,
        // Only the tail of the turn is still being typed. Prose with anything
        // after it is finished, and letting it keep the streaming treatment
        // would leave earlier paragraphs dimmed for the life of the thread.
        streaming: streaming && index === lastIndex,
      })
    }
  }

  return segments
}
