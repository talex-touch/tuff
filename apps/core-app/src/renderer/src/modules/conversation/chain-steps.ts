import type { AiChainStep, AiMessagePart } from '@talex-touch/tuffex/ai-elements'

/** Trimmed so a step title stays one readable line. */
const TITLE_LIMIT = 48

function firstLine(text: string): string {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > TITLE_LIMIT ? `${line.slice(0, TITLE_LIMIT)}…` : line
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
        title: firstLine(part.text) || 'Thinking',
        body: part.text,
        // A reasoning span with no `done` on a settled turn was interrupted,
        // not still running — `streaming` decides which reading applies.
        status: part.done || !streaming ? 'done' : 'active'
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
