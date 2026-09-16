import type { IntelligenceUsageInfo } from '@talex-touch/tuff-intelligence'
import type { CliLineEvent } from './cli-process-runtime'
import { createLogger } from '../../../../utils/logger'

const codexCliLog = createLogger('Intelligence').child('CodexCli')

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
 * `turn.completed.usage` is the OpenAI vocabulary: `input_tokens` is the whole prompt (the cached
 * part is reported alongside it, not on top of it) and `output_tokens` the completion.
 */
function readCodexUsage(value: unknown): IntelligenceUsageInfo | null {
  const usage = asRecord(value)
  if (!usage) return null
  const promptTokens = readCount(usage.input_tokens)
  const completionTokens = readCount(usage.output_tokens)
  if (!promptTokens && !completionTokens) return null
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens }
}

/** The failure text of `turn.failed`, which carries either a message or an error object. */
function readCodexFailure(value: unknown): string {
  const error = asRecord(value)
  return readString(error?.message) ?? readString(value) ?? 'codex ended the turn without an answer'
}

/**
 * Maps one line of `codex exec --json`.
 *
 * `exec --json` streams no deltas: an agent message arrives whole and settled in one line, so it
 * rides `delta` and `commit` together — the runtime applies the delta before committing it, which
 * is exactly the one-shot arrival the chat surface is told to expect.
 *
 * `item.completed` with an `error` item is recorded rather than failed: codex reports non-fatal
 * warnings that way and the turn can still finish with an answer. Only `turn.failed` means the run
 * produced nothing.
 */
export function createCodexLineParser(): (line: string) => CliLineEvent | null {
  return (line) => {
    const trimmed = line.trim()
    if (!trimmed) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      // Diagnostics go to stderr; a stray stdout line is noise rather than a failed turn.
      return null
    }

    const record = asRecord(parsed)
    const type = record ? readString(record.type) : undefined
    if (!record || !type) return null

    if (type === 'item.completed') {
      const item = asRecord(record.item)
      const itemType = item ? readString(item.type) : undefined
      if (!item || !itemType) return null

      if (itemType === 'agent_message') {
        const text = readString(item.text)
        return text ? { delta: text, commit: true } : null
      }

      if (itemType === 'error') {
        codexCliLog.warn('codex reported an item error; the turn may still finish', {
          meta: { message: readString(item.message) ?? 'unknown' }
        })
        return null
      }

      return null
    }

    if (type === 'turn.completed') {
      const usage = readCodexUsage(record.usage)
      return { ...(usage ? { usage } : {}), stopReason: 'stop' }
    }

    if (type === 'turn.failed') {
      return { failure: readCodexFailure(record.error), stopReason: 'error' }
    }

    return null
  }
}
