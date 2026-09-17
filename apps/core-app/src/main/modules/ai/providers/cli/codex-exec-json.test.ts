import { describe, expect, it } from 'vitest'
import { createCodexLineParser } from './codex-exec-json'
import { isFailedStopReason } from './cli-process-runtime'

/**
 * Verbatim lines from a real `codex exec --json --ephemeral` run (0.145.0), kept in
 * `research/cli-protocol-samples.md` — both the healthy run and the unknown-model run, which is
 * the only place the failure shapes appear.
 */
const THREAD_STARTED =
  '{"type":"thread.started","thread_id":"0199d0f3-7f41-7b02-9d5a-2d3f4c1a8e66"}'
const TURN_STARTED = '{"type":"turn.started"}'
const AGENT_MESSAGE =
  '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"pong"}}'
const TURN_COMPLETED =
  '{"type":"turn.completed","usage":{"input_tokens":12935,"cached_input_tokens":2432,"cache_write_input_tokens":0,"output_tokens":41,"reasoning_output_tokens":39}}'
const ITEM_ERROR =
  '{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Model metadata for `no-such-model-xyz` not found. Defaulting to fallback metadata; this may impact performance."}}'
const RECONNECTING =
  '{"type":"error","message":"Reconnecting... 1/5 (unexpected status 404 Not Found: Not Found)"}'
const TURN_FAILED =
  '{"type":"turn.failed","error":{"message":"unexpected status 404 Not Found: Not Found"}}'

const UNKNOWN_MODEL_TRANSCRIPT = [
  ITEM_ERROR,
  TURN_STARTED,
  RECONNECTING,
  RECONNECTING,
  RECONNECTING,
  RECONNECTING,
  RECONNECTING,
  '{"type":"error","message":"unexpected status 404 Not Found: Not Found"}',
  TURN_FAILED
]

describe('createCodexLineParser', () => {
  const parse = createCodexLineParser()

  it('delivers a whole agent message in one line and commits it', () => {
    // `exec --json` streams no deltas: the message arrives settled, so it rides delta and commit
    // together.
    expect(parse(AGENT_MESSAGE)).toEqual({ delta: 'pong', commit: true })
  })

  it('reads the prompt total without double-counting the cached part', () => {
    // `cached_input_tokens` is reported alongside `input_tokens`, not on top of it: adding it back
    // would inflate a 12935-token prompt to 15367.
    expect(parse(TURN_COMPLETED)).toEqual({
      usage: {
        promptTokens: 12935,
        completionTokens: 41,
        totalTokens: 12976
      },
      stopReason: 'stop'
    })
  })

  it('drops an all-zero usage block instead of publishing a free turn', () => {
    const line =
      '{"type":"turn.completed","usage":{"input_tokens":0,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":0}}'
    expect(parse(line)).toEqual({ stopReason: 'stop' })
  })

  it('ignores the metadata item error without failing the turn', () => {
    // Codex reports non-fatal warnings as error items; the turn below still finishes.
    expect(parse(ITEM_ERROR)).toBeNull()
    expect(parse(TURN_COMPLETED)).toEqual({
      usage: { promptTokens: 12935, completionTokens: 41, totalTokens: 12976 },
      stopReason: 'stop'
    })
  })

  it('ignores a reconnect notice, which is a retry in progress rather than a terminal state', () => {
    expect(parse(RECONNECTING)).toBeNull()
  })

  it('reports the message of turn.failed as the failure', () => {
    const event = parse(TURN_FAILED)
    expect(event).toEqual({
      failure: 'unexpected status 404 Not Found: Not Found',
      stopReason: 'error'
    })
    expect(event).not.toHaveProperty('commit')
  })

  it('skips thread and turn starts and non-JSON stdout', () => {
    expect(parse(THREAD_STARTED)).toBeNull()
    expect(parse(TURN_STARTED)).toBeNull()
    expect(parse('Reading additional input from stdin...')).toBeNull()
    expect(parse('')).toBeNull()
  })

  it('surfaces exactly one failure from the recorded unknown-model run', () => {
    const events = UNKNOWN_MODEL_TRANSCRIPT.map((line) => parse(line))

    expect(events.filter((event) => event?.failure).map((event) => event?.failure)).toEqual([
      'unexpected status 404 Not Found: Not Found'
    ])
    expect(events.some((event) => event?.commit)).toBe(false)
  })

  it('uses the stop reason vocabulary the runtime recognises as failure', () => {
    expect(isFailedStopReason(parse(TURN_COMPLETED)?.stopReason)).toBe(false)
    expect(isFailedStopReason(parse(TURN_FAILED)?.stopReason)).toBe(true)
  })
})
