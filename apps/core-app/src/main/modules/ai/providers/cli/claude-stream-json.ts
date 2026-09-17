import type { IntelligenceUsageInfo } from '@talex-touch/tuff-intelligence'
import type { CliLineEvent } from './cli-process-runtime'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Token accounting off a `result` line. Anthropic reports the prompt in three buckets and they are
 * additive: `input_tokens` counts only the part that missed the cache, so a long cached thread would
 * read as nearly free if the two cache buckets were dropped.
 */
function readClaudeUsage(record: JsonRecord): IntelligenceUsageInfo | null {
  const usage = asRecord(record.usage)
  if (!usage) return null
  const promptTokens =
    readCount(usage.input_tokens) +
    readCount(usage.cache_creation_input_tokens) +
    readCount(usage.cache_read_input_tokens)
  const completionTokens = readCount(usage.output_tokens)
  const cost = record.total_cost_usd
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    ...(typeof cost === 'number' && Number.isFinite(cost) ? { cost } : {})
  }
}

/**
 * Maps one line of `claude -p --output-format stream-json --include-partial-messages --verbose`.
 *
 * The answer arrives twice on this stream — as `stream_event` deltas while it is written and again
 * whole in an `assistant` line — so only the deltas are read; taking both would print every answer
 * twice. `subtype` is deliberately ignored: it says why the run stopped (`error_max_turns`, …), not
 * what to show the user, and the CLI's own words are in `result`.
 */
export function createClaudeLineParser(): (line: string) => CliLineEvent | null {
  return (line) => {
    const trimmed = line.trim()
    if (!trimmed) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      // The CLI writes progress to stderr; a non-JSON line on stdout is noise, not a failure.
      return null
    }

    const record = asRecord(parsed)
    const type = record ? readString(record.type) : undefined
    if (!record || !type) return null

    if (type === 'stream_event') {
      const event = asRecord(record.event)
      const eventType = event ? readString(event.type) : undefined
      if (!event || !eventType) return null

      if (eventType === 'message_start') {
        const model = readString(asRecord(event.message)?.model)
        return model ? { model } : null
      }

      if (eventType === 'content_block_delta') {
        const delta = asRecord(event.delta)
        if (!delta || readString(delta.type) !== 'text_delta') return null
        const text = readString(delta.text)
        return text ? { delta: text } : null
      }

      return null
    }

    if (type === 'result') {
      const usage = readClaudeUsage(record)
      const model = readString(record.model)
      const isError = record.is_error === true
      if (!isError) {
        // The turn's last line: commit what streamed, or the answer stays a preview the renderer
        // is free to drop.
        return {
          ...(usage ? { usage } : {}),
          ...(model ? { model } : {}),
          stopReason: 'stop',
          commit: true
        }
      }
      return {
        ...(usage ? { usage } : {}),
        ...(model ? { model } : {}),
        failure:
          readString(record.result) ?? readString(record.error) ?? 'claude reported an error',
        stopReason: 'error'
      }
    }

    return null
  }
}
