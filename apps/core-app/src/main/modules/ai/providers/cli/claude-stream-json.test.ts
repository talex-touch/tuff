import { describe, expect, it } from 'vitest'
import { createClaudeLineParser } from './claude-stream-json'
import { isFailedStopReason } from './cli-process-runtime'

/**
 * Verbatim lines from a real `claude -p --output-format stream-json --include-partial-messages`
 * run (2.1.259), kept in `research/cli-protocol-samples.md`. Hand-written approximations would let
 * the schema drift this parser exists to absorb — a renamed event type, a moved token bucket —
 * pass unnoticed, so every fixture below is an actual stdout line.
 */
const SYSTEM_INIT =
  '{"type":"system","subtype":"init","cwd":"/tmp/tuff-cli-empty","session_id":"2f1c","tools":[],"mcp_servers":[],"model":"claude-sonnet-5","permissionMode":"default"}'
const SYSTEM_STATUS = '{"type":"system","subtype":"status","status":"requesting"}'
const MESSAGE_START =
  '{"type":"stream_event","event":{"type":"message_start","message":{"model":"claude-sonnet-5","usage":{"input_tokens":0}}}}'
const CONTENT_BLOCK_START =
  '{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"text","text":""}}}'
const DELTA_P =
  '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"p"}}}'
const DELTA_ONG =
  '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"ong"}}}'
const CONTENT_BLOCK_STOP = '{"type":"stream_event","event":{"type":"content_block_stop"}}'
const MESSAGE_DELTA =
  '{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn"}}}'
const MESSAGE_STOP = '{"type":"stream_event","event":{"type":"message_stop"}}'

/** The answer is echoed whole on this line after having streamed as deltas. */
const ASSISTANT_LINE = JSON.stringify({
  type: 'assistant',
  message: {
    model: 'claude-sonnet-5',
    content: [{ type: 'text', text: 'pong' }],
    stop_reason: 'end_turn'
  }
})

const RESULT_OK =
  '{"type":"result","subtype":"success","is_error":false,"result":"pong","duration_api_ms":2307,"stop_reason":"end_turn","session_id":"2f1c","total_cost_usd":0.03422,"usage":{"input_tokens":2,"cache_creation_input_tokens":8544,"cache_read_input_tokens":0,"output_tokens":4}}'

/** The unknown-model run: `subtype` still claims success while `is_error` says otherwise. */
const RESULT_ERROR =
  '{"type":"result","subtype":"success","is_error":true,"result":"API Error: 400 unknown provider for model no-such-model-xyz"}'

const HEALTHY_TRANSCRIPT = [
  SYSTEM_INIT,
  SYSTEM_STATUS,
  MESSAGE_START,
  CONTENT_BLOCK_START,
  DELTA_P,
  DELTA_ONG,
  ASSISTANT_LINE,
  CONTENT_BLOCK_STOP,
  MESSAGE_DELTA,
  MESSAGE_STOP,
  RESULT_OK
]

describe('createClaudeLineParser', () => {
  const parse = createClaudeLineParser()

  it('streams every text delta as its own event', () => {
    expect(parse(DELTA_P)).toEqual({ delta: 'p' })
    expect(parse(DELTA_ONG)).toEqual({ delta: 'ong' })
  })

  it('reads the model off message_start without settling the message', () => {
    expect(parse(MESSAGE_START)).toEqual({ model: 'claude-sonnet-5' })
  })

  it('ignores stream events that carry no text', () => {
    for (const line of [CONTENT_BLOCK_START, CONTENT_BLOCK_STOP, MESSAGE_DELTA, MESSAGE_STOP]) {
      expect(parse(line)).toBeNull()
    }
  })

  it('sums the three prompt buckets of a successful result', () => {
    // `input_tokens` is only the part that missed the cache: reading it alone would book a long
    // cached thread as nearly free (2 instead of 8546 prompt tokens).
    expect(parse(RESULT_OK)).toEqual({
      usage: {
        promptTokens: 8546,
        completionTokens: 4,
        totalTokens: 8550,
        cost: 0.03422
      },
      stopReason: 'stop',
      commit: true
    })
  })

  it('fails the turn on is_error even though subtype still says success', () => {
    // The CLI is the one that knows; its `subtype` is about why the run stopped, not what to show.
    const event = parse(RESULT_ERROR)
    expect(event).toEqual({
      failure: 'API Error: 400 unknown provider for model no-such-model-xyz',
      stopReason: 'error'
    })
    expect(event).not.toHaveProperty('commit')
  })

  it('ignores the whole answer echoed back on the assistant line', () => {
    // Reading it too would print the answer a second time: it already streamed as deltas.
    expect(parse(ASSISTANT_LINE)).toBeNull()
  })

  it('skips non-JSON stdout and event types the chat surface has no use for', () => {
    expect(parse('Warning: falling back to a default model')).toBeNull()
    expect(parse('')).toBeNull()
    expect(parse(SYSTEM_INIT)).toBeNull()
    expect(parse(SYSTEM_STATUS)).toBeNull()
  })

  it('streams the recorded answer exactly once across a full run', () => {
    const events = HEALTHY_TRANSCRIPT.map((line) => parse(line))

    expect(events.filter((event) => event?.delta).map((event) => event?.delta)).toEqual([
      'p',
      'ong'
    ])
    expect(events.filter((event) => event?.commit)).toHaveLength(1)
    expect(events.filter((event) => event?.failure)).toHaveLength(0)
  })

  it('never commits text streamed before a failed result', () => {
    // Whatever the deltas previewed, the run produced no answer and must reach the runtime as such
    // instead of as an empty-but-successful message.
    const events = [MESSAGE_START, DELTA_P, DELTA_ONG, RESULT_ERROR].map((line) => parse(line))

    const last = events.at(-1)
    expect(events.some((event) => event?.commit)).toBe(false)
    expect(last?.failure).toBe('API Error: 400 unknown provider for model no-such-model-xyz')
    expect(isFailedStopReason(last?.stopReason)).toBe(true)
  })

  it('uses the stop reason vocabulary the runtime recognises as failure', () => {
    expect(isFailedStopReason(parse(RESULT_OK)?.stopReason)).toBe(false)
    expect(isFailedStopReason(parse(RESULT_ERROR)?.stopReason)).toBe(true)
  })
})
