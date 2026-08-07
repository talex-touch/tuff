import { describe, expect, it } from 'vitest'
import {
  buildPiArgs,
  buildPiPrompt,
  parsePiCliLine,
  PI_CLI_DEFAULT_SYSTEM_PROMPT,
  PI_CLI_TRANSCRIPT_CHAR_BUDGET
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
    expect(prompt.systemPrompt.startsWith(PI_CLI_DEFAULT_SYSTEM_PROMPT)).toBe(true)
  })

  it('anchors every spawn to the wall-clock date', () => {
    // The regression that shipped: no layer named the date, so "今天是几月几日"
    // was answered from the training prior ("2025-02-14").
    const prompt = buildPiPrompt([{ role: 'user', content: 'hi' }], {
      now: new Date(2026, 7, 7)
    })
    expect(prompt.systemPrompt).toContain('Current date: Friday 2026-08-07')
    expect(prompt.systemPrompt).toContain('timezone')
  })

  it('keeps the volatile date line at the very tail of the system prompt', () => {
    // Prompt caching is a prefix match: the only line that ever changes must
    // come after everything that does not, or a day flip evicts it all.
    const prompt = buildPiPrompt(
      [
        { role: 'system', content: 'Be terse.' },
        { role: 'user', content: 'hi' }
      ],
      { now: new Date(2026, 7, 7) }
    )
    expect(prompt.systemPrompt.indexOf('Be terse.')).toBeLessThan(
      prompt.systemPrompt.indexOf('Current date:')
    )
    expect(prompt.systemPrompt.trimEnd().endsWith('about the date.')).toBe(true)
  })

  it('never claims tool-lessness on a spawn that granted tools', () => {
    // The exact regression that shipped: tools registered and allowlisted,
    // while the system prompt still said "you have no tools" — so the model
    // politely wrote text substitutes instead of ever calling one.
    const prompt = buildPiPrompt([{ role: 'user', content: 'hi' }], { toolsGranted: true })
    expect(prompt.systemPrompt).not.toContain('no tools')
    expect(prompt.systemPrompt).toContain('tuff_render_')
    // The announce-then-render contract the widget UX depends on.
    expect(prompt.systemPrompt).toContain('Announce')
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

  it('drops the oldest turns past the budget and says so', () => {
    // 300 turns of 1k chars ≈ 3× the budget: the newest survive contiguously,
    // and the model is told the thread did not start where the excerpt does.
    const turns = Array.from({ length: 300 }, (_, index) => ({
      role: (index % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `turn-${index} ${'x'.repeat(1000)}`
    }))
    const prompt = buildPiPrompt(turns)

    expect(prompt.prompt).toContain('[Earlier context omitted')
    expect(prompt.prompt).toContain('turn-298')
    expect(prompt.prompt).not.toContain('turn-0 ')
    expect(prompt.prompt.length).toBeLessThan(PI_CLI_TRANSCRIPT_CHAR_BUDGET + 2000)
  })

  it('holds the over-budget cut point still across sends — prompt-cache stability', () => {
    // The provider's prompt cache is a byte-exact prefix match. A cut that
    // slid one turn per send (or a marker with a live count) rewrote the
    // transcript head every turn and evicted the whole cache. The quantized
    // cut must keep the previous prompt's pre-`---` head as a byte-identical
    // prefix of the next send's prompt.
    const turns = Array.from({ length: 300 }, (_, index) => ({
      role: (index % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `turn-${index} ${'x'.repeat(1000)}`
    }))
    const before = buildPiPrompt(turns)
    const after = buildPiPrompt([
      ...turns,
      { role: 'assistant', content: 'a'.repeat(500) },
      { role: 'user', content: 'next question' }
    ])

    const head = before.prompt.slice(0, before.prompt.indexOf('\n\n---\n\n'))
    expect(after.prompt.startsWith(head)).toBe(true)
  })

  it('keeps a short thread whole with no omission marker', () => {
    const prompt = buildPiPrompt([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'second' }
    ])
    expect(prompt.prompt).not.toContain('omitted')
  })

  it('never drops the latest turn, even alone over budget', () => {
    const giant = 'y'.repeat(PI_CLI_TRANSCRIPT_CHAR_BUDGET + 5000)
    const prompt = buildPiPrompt([
      { role: 'user', content: 'old' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: giant }
    ])
    expect(prompt.prompt).toContain(giant)
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

  it('passes attachments as @file positionals between the options and the message', () => {
    // `pi [options] [@files...] [messages...]`: an @file after the message is read as part of the
    // next positional group, so the order here is what makes the image visible to the model.
    const args = buildPiArgs(prompt, 'codex/gpt-5.6-terra', undefined, [
      '/tmp/tuff-attach-1.png',
      '/tmp/tuff-attach-2.webp'
    ])

    expect(args.slice(-3)).toEqual(['@/tmp/tuff-attach-1.png', '@/tmp/tuff-attach-2.webp', 'hi'])
    expect(args.indexOf('@/tmp/tuff-attach-1.png')).toBeGreaterThan(args.indexOf('--model'))
  })

  it('leaves the argument shape untouched when the turn carried no attachment', () => {
    expect(buildPiArgs(prompt, undefined, undefined, [])).toEqual(buildPiArgs(prompt))
    expect(buildPiArgs(prompt).some((arg) => arg.startsWith('@'))).toBe(false)
  })

  it('grants tools through the allowlist plus the explicitly loaded forwarder', () => {
    const args = buildPiArgs(prompt, undefined, {
      tools: ['tuff_render_form', 'tuff_render_chart'],
      extensionPath: '/repo/packages/pi-extension-tuff/index.ts'
    })

    expect(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2)).toEqual([
      '--tools',
      'tuff_render_form,tuff_render_chart'
    ])
    // Isolation stays unconditional — the user's own extension park never
    // rides along; only the app's forwarder is loaded, by explicit path.
    expect(args).toContain('--no-extensions')
    expect(args.slice(args.indexOf('-e'), args.indexOf('-e') + 2)).toEqual([
      '-e',
      '/repo/packages/pi-extension-tuff/index.ts'
    ])
    expect(args).not.toContain('--no-tools')
  })

  it('stays tool-free when the allowlist exists but the forwarder is missing', () => {
    const args = buildPiArgs(prompt, undefined, { tools: ['tuff_render_form'] })
    expect(args).toContain('--tools')
    expect(args).toContain('--no-extensions')
    expect(args).not.toContain('-e')
  })
})

describe('parsePiCliLine part events (shapes from a live pi 0.83 run)', () => {
  function update(inner: Record<string, unknown>): string {
    return JSON.stringify({ type: 'message_update', assistantMessageEvent: inner })
  }

  it('maps session-level compaction events onto compaction part events', () => {
    // Auto-compaction is on by default in pi; these arrive on the same stdout
    // stream as message updates and were previously discarded wholesale.
    expect(parsePiCliLine('{"type":"compaction_start","reason":"threshold"}')).toEqual({
      partEvent: { kind: 'compaction-start', reason: 'threshold' }
    })
    expect(parsePiCliLine('{"type":"compaction_start"}')).toEqual({
      partEvent: { kind: 'compaction-start' }
    })
    expect(parsePiCliLine('{"type":"compaction_end"}')).toEqual({
      partEvent: { kind: 'compaction-end' }
    })
  })

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

  it('opens the tool lifecycle at toolcall_end, from its top-level toolCall', () => {
    // The wire strips `partial` from every message_update (pi's json-event
    // layer), so `toolcall_start`/`_delta` arrive as bare content indexes —
    // unusable. `toolcall_end` is the first line that names the call, and it
    // must yield start + settled input together or no tool part ever exists.
    // (The previous partial-based reader returned null on all three events;
    // that regression is what shipped as "widgets never render".)
    expect(parsePiCliLine(update({ type: 'toolcall_start', contentIndex: 1 }))).toBeNull()
    expect(
      parsePiCliLine(update({ type: 'toolcall_delta', contentIndex: 1, delta: '{"path' }))
    ).toBeNull()

    expect(
      parsePiCliLine(
        update({
          type: 'toolcall_end',
          contentIndex: 1,
          toolCall: { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: '/tmp/x' } }
        })
      )
    ).toEqual({
      partEvents: [
        { kind: 'tool-start', callId: 'call_1', name: 'read' },
        { kind: 'tool-input-end', callId: 'call_1', input: { path: '/tmp/x' } }
      ]
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

  it('ignores a toolcall_end whose toolCall carries no id', () => {
    expect(
      parsePiCliLine(
        update({
          type: 'toolcall_end',
          contentIndex: 0,
          toolCall: { type: 'toolCall', name: 'read' }
        })
      )
    ).toBeNull()
  })
})

/**
 * Shapes taken from `research/evidence-pi-retry-stall.ndjson`: one `pi` process that ran the same
 * prompt four times, discarded three of them, and still exited 0.
 */
describe('parsePiCliLine commit and rollback', () => {
  const FAILED_END_LINE = JSON.stringify({
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [],
      provider: 'codex',
      model: 'gpt-5.6-terra',
      stopReason: 'error',
      errorMessage: 'Request aborted\n\n[stall-watchdog-retry] provider returned error'
    }
  })

  const RETRY_START_LINE = JSON.stringify({
    type: 'auto_retry_start',
    attempt: 1,
    maxAttempts: 3,
    delayMs: 2000,
    errorMessage: 'Request aborted'
  })

  it('commits the text of a message pi settled', () => {
    expect(parsePiCliLine(MESSAGE_END_LINE)).toMatchObject({
      stopReason: 'stop',
      partEvent: { kind: 'message-commit' }
    })
  })

  it('withholds the commit from a message that ended in an error', () => {
    const event = parsePiCliLine(FAILED_END_LINE)
    expect(event).not.toHaveProperty('partEvent')
    expect(event?.stopReason).toBe('error')
    expect(event?.failure).toContain('stall-watchdog-retry')
  })

  it('ignores the stopReason on message_start, which describes a message still being written', () => {
    // `pending` on a healthy run and `aborted` on a failed one — committing on either would settle
    // text mid-flight or discard a message pi had not given up on yet.
    const aborted = MESSAGE_START_LINE.replace('"stopReason":"pending"', '"stopReason":"aborted"')
    for (const line of [MESSAGE_START_LINE, aborted]) {
      expect(parsePiCliLine(line)).not.toHaveProperty('partEvent')
      expect(parsePiCliLine(line)).not.toHaveProperty('stopReason')
    }
  })

  it('does not commit twice when turn_end repeats the message that just settled', () => {
    const line = MESSAGE_END_LINE.replace('"type":"message_end"', '"type":"turn_end"')
    expect(parsePiCliLine(line)).not.toHaveProperty('partEvent')
  })

  it('rolls back the abandoned attempt when pi restarts the turn', () => {
    expect(parsePiCliLine(RETRY_START_LINE)).toEqual({
      partEvent: { kind: 'text-reset' },
      retry: { attempt: 1, maxAttempts: 3, delayMs: 2000 }
    })
  })

  it('reports the reason when the retry budget runs out', () => {
    const line = JSON.stringify({
      type: 'auto_retry_end',
      success: false,
      attempt: 3,
      finalError: 'Request aborted\n\n[stall-watchdog-retry] provider returned error'
    })
    expect(parsePiCliLine(line)?.failure).toContain('Request aborted')
  })

  it('stays quiet when a retry eventually succeeded', () => {
    expect(parsePiCliLine('{"type":"auto_retry_end","success":true,"attempt":2}')).toBeNull()
  })

  it('surfaces one rollback per abandoned attempt across a four-attempt run', () => {
    const lines = [
      ...[1, 2, 3].flatMap((attempt) => [
        MESSAGE_START_LINE,
        DELTA_LINE,
        FAILED_END_LINE,
        JSON.stringify({ type: 'agent_end', willRetry: true }),
        JSON.stringify({ type: 'auto_retry_start', attempt, maxAttempts: 3, delayMs: 2000 })
      ]),
      MESSAGE_START_LINE,
      DELTA_LINE,
      MESSAGE_END_LINE,
      '{"type":"agent_settled"}'
    ]

    const kinds = lines.map((line) => parsePiCliLine(line)?.partEvent?.kind)

    expect(kinds.filter((kind) => kind === 'text-reset')).toHaveLength(3)
    expect(kinds.filter((kind) => kind === 'message-commit')).toHaveLength(1)
  })

  it('leaves a tool loop alone: every message in it settles for real', () => {
    // A turn legitimately contains several assistant messages (text → toolCall → toolResult →
    // text). Each is committed and none is rolled back, or the tool card and its lead-in would
    // disappear the moment the answer after them had to be rewritten.
    const toolUseEnd = MESSAGE_END_LINE.replace('"stopReason":"stop"', '"stopReason":"toolUse"')
    const events = [DELTA_LINE, toolUseEnd, MESSAGE_START_LINE, DELTA_LINE, MESSAGE_END_LINE].map(
      (line) => parsePiCliLine(line)?.partEvent?.kind
    )

    expect(events).toEqual([undefined, 'message-commit', undefined, undefined, 'message-commit'])
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

  it('keeps extension discovery off in every mode — the forwarder loads by path', () => {
    // Discovery-on used to be how the tool forwarder loaded, which also pulled
    // the user's entire globally installed extension park into headless runs.
    // The forwarder now rides in through an explicit `-e`, which pi honours
    // even under `--no-extensions`, so isolation is unconditional.
    expect(buildPiArgs(prompt)).toContain('--no-extensions')
    expect(buildPiArgs(prompt, undefined, { tools: ['tuff_read_file'] })).toContain(
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
