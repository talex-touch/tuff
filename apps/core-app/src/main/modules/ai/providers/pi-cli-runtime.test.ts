import { describe, expect, it } from 'vitest'
import {
  buildPiArgs,
  buildPiPrompt,
  parsePiCliLine,
  PI_CLI_DEFAULT_SYSTEM_PROMPT
} from './pi-cli-runtime'

/**
 * The fixtures below are verbatim lines from a real `pi -p --mode json` run (0.83.0), trimmed to the
 * fields the provider reads. Hand-written approximations would let a schema drift pass unnoticed.
 */
const DELTA_LINE =
  '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"hello"},"message":{"role":"assistant","content":[{"type":"text","text":"hello"}]}}'

const MESSAGE_START_LINE =
  '{"type":"message_start","message":{"role":"assistant","content":[],"api":"openai-responses","provider":"codex","model":"gpt-5.6-terra","stopReason":"pending"}}'

const MESSAGE_END_LINE =
  '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"hello"}],"provider":"codex","model":"gpt-5.6-terra","usage":{"input":965,"output":5,"cacheRead":3840,"cacheWrite":0,"totalTokens":4810,"cost":{"input":0,"output":0,"total":0}},"stopReason":"stop"}}'

describe('parsePiCliLine', () => {
  it('reads the text delta out of a message_update event', () => {
    expect(parsePiCliLine(DELTA_LINE)).toEqual({ delta: 'hello' })
  })

  it('reads provider and model off message_start', () => {
    expect(parsePiCliLine(MESSAGE_START_LINE)).toEqual({
      provider: 'codex',
      model: 'gpt-5.6-terra'
    })
  })

  it('maps pi usage fields onto the intelligence usage shape', () => {
    expect(parsePiCliLine(MESSAGE_END_LINE)?.usage).toEqual({
      promptTokens: 965,
      completionTokens: 5,
      totalTokens: 4810
    })
  })

  it('omits cost when pi reports a zero total', () => {
    expect(parsePiCliLine(MESSAGE_END_LINE)?.usage).not.toHaveProperty('cost')
  })

  it('keeps a non-zero reported cost', () => {
    const line =
      '{"type":"message_end","message":{"role":"assistant","usage":{"input":10,"output":2,"totalTokens":12,"cost":{"total":0.5}}}}'
    expect(parsePiCliLine(line)?.usage?.cost).toBe(0.5)
  })

  it('drops an all-zero usage block so it cannot overwrite a real reading', () => {
    const line =
      '{"type":"message_end","message":{"role":"assistant","usage":{"input":0,"output":0,"totalTokens":0}}}'
    expect(parsePiCliLine(line)).toBeNull()
  })

  it('ignores user-role messages so the echoed prompt never counts as output', () => {
    const line = '{"type":"message_start","message":{"role":"user","content":[{"type":"text"}]}}'
    expect(parsePiCliLine(line)).toBeNull()
  })

  it('reports the settled marker', () => {
    expect(parsePiCliLine('{"type":"agent_settled"}')).toEqual({ done: true })
  })

  it('skips event types the chat surface has no use for', () => {
    expect(parsePiCliLine('{"type":"turn_start"}')).toBeNull()
    expect(parsePiCliLine('{"type":"session","version":3,"id":"x"}')).toBeNull()
  })

  it('treats non-JSON stdout noise as skippable rather than fatal', () => {
    expect(parsePiCliLine('Downloading model catalog...')).toBeNull()
    expect(parsePiCliLine('')).toBeNull()
  })
})

describe('buildPiPrompt', () => {
  it('sends a lone user turn as bare text, with no transcript framing', () => {
    const prompt = buildPiPrompt([{ role: 'user', content: 'hi' }])
    expect(prompt.prompt).toBe('hi')
    expect(prompt.systemPrompt).toBe(PI_CLI_DEFAULT_SYSTEM_PROMPT)
  })

  it('renders prior turns with role labels because pi cannot take assistant turns as arguments', () => {
    const prompt = buildPiPrompt([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'second' }
    ])
    expect(prompt.prompt).toContain('User: first')
    expect(prompt.prompt).toContain('Assistant: answer')
    expect(prompt.prompt.endsWith('User: second')).toBe(true)
  })

  it('appends system messages to the default prompt instead of replacing it', () => {
    const prompt = buildPiPrompt([
      { role: 'system', content: 'Be terse.' },
      { role: 'user', content: 'hi' }
    ])
    expect(prompt.systemPrompt.startsWith(PI_CLI_DEFAULT_SYSTEM_PROMPT)).toBe(true)
    expect(prompt.systemPrompt).toContain('Be terse.')
    // A system message must not leak into the transcript as a labelled turn.
    expect(prompt.prompt).toBe('hi')
  })

  it('drops blank turns so they cannot become empty labelled lines', () => {
    const prompt = buildPiPrompt([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: '   ' },
      { role: 'user', content: 'second' }
    ])
    expect(prompt.prompt).not.toContain('Assistant:')
  })
})

describe('buildPiArgs', () => {
  const prompt = { systemPrompt: 'sys', prompt: 'hi' }

  it('withholds tools, session persistence and repository context discovery', () => {
    const args = buildPiArgs(prompt)
    expect(args).toContain('--no-tools')
    expect(args).toContain('--no-session')
    expect(args).toContain('--no-context-files')
    expect(args).toContain('--no-extensions')
    expect(args).toContain('--no-skills')
  })

  it('requests NDJSON in non-interactive mode', () => {
    const args = buildPiArgs(prompt)
    expect(args).toContain('--print')
    expect(args.slice(args.indexOf('--mode'), args.indexOf('--mode') + 2)).toEqual([
      '--mode',
      'json'
    ])
  })

  it('passes the prompt last so it is read as the positional message, not a flag value', () => {
    expect(buildPiArgs(prompt).at(-1)).toBe('hi')
    expect(buildPiArgs(prompt, 'codex/gpt-5.6-terra').at(-1)).toBe('hi')
  })

  it('forwards an explicit model and omits the flag entirely when none is chosen', () => {
    expect(buildPiArgs(prompt, 'codex/gpt-5.6-terra')).toContain('--model')
    expect(buildPiArgs(prompt)).not.toContain('--model')
  })
})

describe('parsePiCliLine part events (shapes from a live pi 0.83 run)', () => {
  function update(inner: Record<string, unknown>): string {
    return JSON.stringify({ type: 'message_update', assistantMessageEvent: inner })
  }

  const toolPiece = { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: '/tmp/x' } }

  it('maps thinking events onto reasoning part events', () => {
    expect(parsePiCliLine(update({ type: 'thinking_start', contentIndex: 0 }))).toEqual({
      partEvent: { kind: 'reasoning-start' }
    })
    expect(
      parsePiCliLine(update({ type: 'thinking_delta', contentIndex: 0, delta: '思考' }))
    ).toEqual({
      partEvent: { kind: 'reasoning-delta', delta: '思考' }
    })
    expect(parsePiCliLine(update({ type: 'thinking_end', contentIndex: 0, content: '' }))).toEqual({
      partEvent: { kind: 'reasoning-end' }
    })
  })

  it('maps the tool call lifecycle with ids from the partial content piece', () => {
    const partial = { content: [{ type: 'text', text: '' }, toolPiece] }

    expect(parsePiCliLine(update({ type: 'toolcall_start', contentIndex: 1, partial }))).toEqual({
      partEvent: { kind: 'tool-start', callId: 'call_1', name: 'read' }
    })

    expect(
      parsePiCliLine(update({ type: 'toolcall_delta', contentIndex: 1, delta: '{"path', partial }))
    ).toEqual({ partEvent: { kind: 'tool-input-delta', callId: 'call_1', delta: '{"path' } })

    expect(parsePiCliLine(update({ type: 'toolcall_end', contentIndex: 1, partial }))).toEqual({
      partEvent: { kind: 'tool-input-end', callId: 'call_1', input: { path: '/tmp/x' } }
    })
  })

  it('maps toolResult messages onto tool-result events', () => {
    const line = JSON.stringify({
      type: 'message_end',
      message: {
        role: 'toolResult',
        toolCallId: 'call_1',
        toolName: 'read',
        content: [
          { type: 'text', text: 'line1-' },
          { type: 'text', text: 'probe' }
        ],
        isError: false
      }
    })

    expect(parsePiCliLine(line)).toEqual({
      partEvent: {
        kind: 'tool-result',
        callId: 'call_1',
        name: 'read',
        output: 'line1-probe',
        isError: false
      }
    })
  })

  it('flags failed tool results', () => {
    const line = JSON.stringify({
      type: 'message_end',
      message: {
        role: 'toolResult',
        toolCallId: 'call_2',
        toolName: 'read',
        content: [{ type: 'text', text: 'denied' }],
        isError: true
      }
    })

    expect(parsePiCliLine(line)).toMatchObject({
      partEvent: { kind: 'tool-result', isError: true }
    })
  })

  it('ignores malformed tool updates without an id', () => {
    expect(
      parsePiCliLine(
        update({
          type: 'toolcall_start',
          contentIndex: 0,
          partial: { content: [{ type: 'text' }] }
        })
      )
    ).toBeNull()
  })
})

describe('buildPiArgs tool allowlist', () => {
  const prompt = { systemPrompt: 'sys', prompt: 'User: hi' }

  it('keeps --no-tools without an allowlist', () => {
    expect(buildPiArgs(prompt)).toContain('--no-tools')
    expect(buildPiArgs(prompt, undefined, { tools: [] })).toContain('--no-tools')
  })

  it('enables exactly the allowlisted tools', () => {
    const args = buildPiArgs(prompt, undefined, { tools: ['read', 'tuff_search_files'] })
    expect(args).not.toContain('--no-tools')
    const flagIndex = args.indexOf('--tools')
    expect(flagIndex).toBeGreaterThan(-1)
    expect(args[flagIndex + 1]).toBe('read,tuff_search_files')
  })

  it('drops blank entries rather than emitting an empty allowlist', () => {
    expect(buildPiArgs(prompt, undefined, { tools: [' ', ''] })).toContain('--no-tools')
  })

  it('loads extensions only when tools are granted', () => {
    // Tuff's tools ship as a pi extension, so --no-extensions would silently
    // cancel the allowlist we just handed over.
    expect(buildPiArgs(prompt)).toContain('--no-extensions')
    expect(buildPiArgs(prompt, undefined, { tools: ['tuff_read_file'] })).not.toContain(
      '--no-extensions'
    )
  })

  it('never loads skills, sessions or context files either way', () => {
    for (const args of [buildPiArgs(prompt), buildPiArgs(prompt, undefined, { tools: ['read'] })]) {
      expect(args).toContain('--no-session')
      expect(args).toContain('--no-skills')
      expect(args).toContain('--no-context-files')
    }
  })
})
