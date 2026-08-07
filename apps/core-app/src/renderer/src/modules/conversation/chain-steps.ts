import type { AiChainStep, AiMessagePart } from '@talex-touch/tuffex/ai-elements'

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
 * Derives the chain-of-thought timeline from a message's parts.
 *
 * Text parts are excluded on purpose: they are the answer, rendered in the
 * message body — repeating them inside the reasoning trail would show the same
 * words twice.
 */
export function toChainSteps(
  parts: AiMessagePart[] | undefined,
  streaming: boolean
): AiChainStep[] {
  if (!parts) return []

  const steps: AiChainStep[] = []
  for (const [index, part] of parts.entries()) {
    if (part.type === 'reasoning') {
      steps.push({
        id: `reasoning-${index}`,
        kind: 'thinking',
        title: plainTitle(part.text) || 'Thinking',
        // Without the title line — repeating it as the body's first row read
        // as a rendering bug. The rest is markdown; the trail renders it so.
        body: bodyFor(part.text),
        // A reasoning span with no `done` on a settled turn was interrupted,
        // not still running — `streaming` decides which reading applies.
        status: part.done || !streaming ? 'done' : 'active',
        durationMs: part.durationMs
      })
      continue
    }

    if (part.type === 'tool-call') {
      steps.push({
        id: part.id,
        kind: 'tool',
        title: part.summary || part.name,
        body: part.error || part.output || part.logs,
        status:
          part.status === 'error'
            ? 'error'
            : part.status === 'done'
              ? 'done'
              : streaming
                ? 'active'
                : 'error'
      })
    }
  }

  return steps
}

/** Only a real multi-step trail earns the timeline; one step reads better inline. */
export function shouldUseChainView(steps: AiChainStep[]): boolean {
  return steps.length > 1
}
