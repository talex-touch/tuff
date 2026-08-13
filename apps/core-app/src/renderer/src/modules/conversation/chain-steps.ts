import type {
  AiChainStep,
  AiMessagePart,
  AiReasoningPart,
  AiToolCallPart
} from '@talex-touch/tuffex/ai-elements'

/** Trimmed so a step title stays one readable line. */
const TITLE_LIMIT = 48

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
  if (first.length > TITLE_LIMIT) return text.trim() || undefined
  const rest = index === -1 ? '' : text.slice(index + 1).trim()
  return rest || undefined
}

/**
 * One rendered unit of an assistant turn, in the order the provider streamed
 * it — including the answer prose, so a turn that speaks between two thoughts
 * renders in that order rather than collecting all its text at the bottom.
 *
 * Callers must render text from these segments *instead of* the message's own
 * `content`, never both: in parts mode the text parts concatenate to exactly
 * that string, so doing both shows the answer twice.
 */
export type MessageSegment =
  | { kind: 'reasoning'; id: string; step: AiChainStep }
  | { kind: 'tool'; id: string; part: AiToolCallPart }
  | { kind: 'text'; id: string; text: string; streaming: boolean }

/**
 * Wording the host owns. A span's title heads its own block now, so a
 * hard-coded English fallback would surface as a header in a localized UI.
 */
export interface SegmentLabels {
  /** Header for a span whose text has not arrived yet. */
  thinking?: string
  /** Alert text for a call the turn ended without ever answering. */
  interrupted?: string
}

function toReasoningStep(
  part: AiReasoningPart,
  index: number,
  streaming: boolean,
  thinkingLabel?: string
): AiChainStep {
  return {
    id: `reasoning-${index}`,
    kind: 'thinking',
    title: plainTitle(part.text) || thinkingLabel || 'Thinking',
    // Without the title line — repeating it as the body's first row read
    // as a rendering bug. The rest is markdown; the trail renders it so.
    body: bodyFor(part.text),
    // A reasoning span with no `done` on a settled turn was interrupted,
    // not still running — `streaming` decides which reading applies.
    status: part.done || !streaming ? 'done' : 'active',
    durationMs: part.durationMs
  }
}

/**
 * A call still pending or running once the turn has settled never came back —
 * the card renders straight from `status`, so left alone it would spin for the
 * life of the thread.
 *
 * The original part is returned whenever nothing needs correcting: callers
 * write back to it (a submitted form marks itself on the part so the answer
 * persists with the thread), and a copy would swallow that write. Only the
 * interrupted case allocates, and a form can never be in it — a form part is
 * only ever rendered once its call is `done`.
 */
function settledToolPart(
  part: AiToolCallPart,
  streaming: boolean,
  interruptedLabel?: string
): AiToolCallPart {
  if (streaming || part.status === 'done' || part.status === 'error') return part
  // The card renders `error` as its alert text; without a fallback an
  // interrupted call would show an empty red block.
  return { ...part, status: 'error', error: part.error ?? interruptedLabel }
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
  labels: SegmentLabels = {}
): MessageSegment[] {
  if (!parts) return []

  const segments: MessageSegment[] = []
  const lastIndex = parts.length - 1

  for (const [index, part] of parts.entries()) {
    if (part.type === 'reasoning') {
      segments.push({
        kind: 'reasoning',
        id: `reasoning-${index}`,
        step: toReasoningStep(part, index, streaming, labels.thinking)
      })
      continue
    }

    if (part.type === 'tool-call') {
      segments.push({
        kind: 'tool',
        id: part.id,
        part: settledToolPart(part, streaming, labels.interrupted)
      })
      continue
    }

    if (part.type === 'text') {
      // An empty part is the accumulator mid-rollback, not a paragraph.
      if (!part.text) continue
      segments.push({
        kind: 'text',
        id: `text-${index}`,
        text: part.text,
        // Only the tail of the turn is still being typed. Prose with anything
        // after it is finished, and letting it keep the streaming treatment
        // would leave earlier paragraphs dimmed for the life of the thread.
        streaming: streaming && index === lastIndex
      })
    }
  }

  return segments
}
