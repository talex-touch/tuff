import type {
  IntelligenceAgentResult,
  IntelligenceStreamEvent
} from '@talex-touch/tuff-intelligence'
import type { PiRuntimeRunEvent } from './pi-agent-runtime-protocol'

type AgentStreamEvent = IntelligenceStreamEvent<IntelligenceAgentResult>

const OBSERVATION_LIMIT = 500

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * The text of a tool result as the Pi worker reports it: `content` blocks of type `text`. The host
 * has already bounded and redacted the output before the worker saw it, so nothing here re-reads it.
 */
function toolResultText(result: unknown, sanitize: (value: unknown) => unknown): string {
  const content = asRecord(result).content
  if (Array.isArray(content)) {
    const text = content
      .map((block) => asRecord(block))
      .filter((block) => block.type === 'text')
      .map((block) => asText(block.text))
      .join('')
    if (text) return text
  }
  return JSON.stringify(sanitize(result)) ?? ''
}

/**
 * Turns one agent run's raw runtime events into the structured stream `stream('agent.run')`
 * returns: text and reasoning deltas, and tool calls as typed `part` events with their input and
 * result. A tool call is whatever the runtime executed - never something read out of model text.
 *
 * The same pass accumulates what the final `IntelligenceAgentResult` reports (tool calls, steps,
 * iterations), so the stream's `end` and a plain `invoke` describe a run the same way.
 */
export function createAgentRunStreamMapper(
  capabilityId: string,
  sanitize: (value: unknown) => unknown
) {
  const toolCalls: IntelligenceAgentResult['toolCalls'] = []
  const steps: IntelligenceAgentResult['steps'] = []
  const inputs = new Map<string, unknown>()
  let turns = 0

  return {
    map(event: PiRuntimeRunEvent): AgentStreamEvent[] {
      const payload = asRecord(event.payload)
      switch (event.type) {
        case 'message_update': {
          const update = asRecord(payload.assistantMessageEvent)
          const delta = asText(update.delta)
          if (!delta) return []
          if (update.type === 'text_delta') return [{ type: 'delta', capabilityId, delta }]
          if (update.type === 'thinking_delta') {
            return [{ type: 'part', capabilityId, partEvent: { kind: 'reasoning-delta', delta } }]
          }
          return []
        }
        // `OmpAgentRuntimeHost` reports a bare `{ delta }` under its own event names; they mean
        // the same as the Pi worker's `thinking_delta` / `text_delta`, so both runtimes reach the
        // renderer as one stream shape.
        case 'reasoning': {
          const delta = asText(payload.delta)
          if (!delta) return []
          return [{ type: 'part', capabilityId, partEvent: { kind: 'reasoning-delta', delta } }]
        }
        case 'text': {
          const delta = asText(payload.delta)
          if (!delta) return []
          return [{ type: 'delta', capabilityId, delta }]
        }
        case 'tool_execution_start': {
          const callId = asText(payload.toolCallId)
          const name = asText(payload.toolName)
          if (!callId || !name) return []
          const input = sanitize(payload.args)
          inputs.set(callId, input)
          return [
            { type: 'part', capabilityId, partEvent: { kind: 'tool-start', callId, name } },
            { type: 'part', capabilityId, partEvent: { kind: 'tool-input-end', callId, input } }
          ]
        }
        case 'tool_execution_end': {
          const callId = asText(payload.toolCallId)
          const name = asText(payload.toolName)
          if (!callId || !name) return []
          const output = toolResultText(payload.result, sanitize)
          const isError = payload.isError === true
          const input = inputs.get(callId)
          toolCalls.push({ tool: name, input, output })
          steps.push({
            thought: `Called ${name}`,
            action: name,
            actionInput: input,
            observation: output.slice(0, OBSERVATION_LIMIT)
          })
          return [
            {
              type: 'part',
              capabilityId,
              partEvent: { kind: 'tool-result', callId, name, output, isError }
            }
          ]
        }
        case 'turn_end':
          turns += 1
          return []
        default:
          return []
      }
    },

    result(output: string): IntelligenceAgentResult {
      return {
        result: output,
        steps: [
          ...steps,
          {
            thought: 'Answered by the Tuff Pi coordinator',
            observation: output.slice(0, OBSERVATION_LIMIT)
          }
        ],
        toolCalls: [...toolCalls],
        iterations: Math.max(1, turns)
      }
    }
  }
}
