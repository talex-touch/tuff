import { describe, expect, it } from 'vitest'
import {
  fromWireToolName,
  parseToolArguments,
  ToolCallAssembler,
  toLangChainAssistantMessage,
  toLangChainTools,
  toLangChainToolMessage,
  toWireToolName
} from './native-tools'

const chunk = (...fragments: Array<Record<string, unknown>>) => ({ tool_call_chunks: fragments })

describe('tool names on the wire', () => {
  it('round-trips every id shape the host registers', () => {
    for (const id of ['file.read', 'desktop.context.activeApp', 'mcp.listTools', 'bash']) {
      const wire = toWireToolName(id)
      expect(wire).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
      expect(fromWireToolName(wire)).toBe(id)
    }
  })

  it('refuses an id that would not survive the round trip instead of renaming it', () => {
    expect(() => toWireToolName('weird name')).toThrow(/TOOL_NAME_UNSUPPORTED/)
    expect(() => toWireToolName('a__b')).toThrow(/TOOL_NAME_UNSUPPORTED/)
    expect(() => toWireToolName('x'.repeat(65))).toThrow(/TOOL_NAME_UNSUPPORTED/)
  })

  it('offers tools to the model under their wire names', () => {
    const [tool] = toLangChainTools([
      { name: 'file.read', description: 'Read a file', parameters: { type: 'object' } }
    ])
    expect(tool.function.name).toBe('file__read')
  })
})

describe('ToolCallAssembler', () => {
  it('reports a call when it names itself and its input once the arguments are whole', () => {
    const assembler = new ToolCallAssembler()
    expect(
      assembler.pushMessageChunk(chunk({ index: 0, id: 'call_1', name: 'file__read', args: '' }))
    ).toEqual([{ kind: 'tool-start', callId: 'call_1', name: 'file.read' }])
    expect(assembler.pushMessageChunk(chunk({ index: 0, args: '{"path":"a' }))).toEqual([])
    expect(assembler.pushMessageChunk(chunk({ index: 0, args: '.txt"}' }))).toEqual([])
    expect(assembler.finish()).toEqual([
      { kind: 'tool-input-end', callId: 'call_1', input: { path: 'a.txt' } }
    ])
  })

  it('keeps parallel calls apart by index and reports them in stream order', () => {
    const assembler = new ToolCallAssembler()
    assembler.pushMessageChunk(
      chunk(
        { index: 1, id: 'b', name: 'file__list', args: '{}' },
        { index: 0, id: 'a', name: 'file__read', args: '{"path":"x"}' }
      )
    )
    expect(assembler.finish()).toEqual([
      { kind: 'tool-input-end', callId: 'a', input: { path: 'x' } },
      { kind: 'tool-input-end', callId: 'b', input: {} }
    ])
  })

  it('drops a fragment that never named itself rather than inventing a call', () => {
    const assembler = new ToolCallAssembler()
    expect(assembler.pushMessageChunk(chunk({ index: 0, args: '{"orphan":true}' }))).toEqual([])
    expect(assembler.finish()).toEqual([])
  })

  it('ignores a message chunk that carries no tool-call fragments', () => {
    const assembler = new ToolCallAssembler()
    expect(assembler.pushMessageChunk({ content: 'hello' })).toEqual([])
    expect(assembler.pushMessageChunk(null)).toEqual([])
    expect(assembler.pushMessageChunk({ tool_call_chunks: 'not an array' })).toEqual([])
    expect(assembler.finish()).toEqual([])
  })

  it('keeps parallel calls apart when a proxy omits index or reuses index 0 with distinct ids', () => {
    const assembler = new ToolCallAssembler()
    const startedA = assembler.pushMessageChunk(
      chunk({ index: 0, id: 'call_1', name: 'browser__search', args: '{"query":' })
    )
    assembler.pushMessageChunk(chunk({ index: 0, args: '"QUIC"}' }))
    const startedB = assembler.pushMessageChunk(
      chunk({ index: 0, id: 'call_2', name: 'browser__extract', args: '{"url":' })
    )
    assembler.pushMessageChunk(
      chunk({ index: 0, args: '"https://www.rfc-editor.org/rfc/rfc9001.html"}' })
    )
    const startedC = assembler.pushMessageChunk(
      chunk({ id: 'call_3', name: 'browser__extract', args: '{"url":' })
    )
    assembler.pushMessageChunk(chunk({ args: '"https://www.rfc-editor.org/rfc/rfc9000.html"}' }))

    expect([...startedA, ...startedB, ...startedC]).toEqual([
      { kind: 'tool-start', callId: 'call_1', name: 'browser.search' },
      { kind: 'tool-start', callId: 'call_2', name: 'browser.extract' },
      { kind: 'tool-start', callId: 'call_3', name: 'browser.extract' }
    ])
    expect(assembler.finish()).toEqual([
      { kind: 'tool-input-end', callId: 'call_1', input: { query: 'QUIC' } },
      {
        kind: 'tool-input-end',
        callId: 'call_2',
        input: { url: 'https://www.rfc-editor.org/rfc/rfc9001.html' }
      },
      {
        kind: 'tool-input-end',
        callId: 'call_3',
        input: { url: 'https://www.rfc-editor.org/rfc/rfc9000.html' }
      }
    ])
  })
})

describe('parseToolArguments', () => {
  it('treats no arguments as an empty object and malformed ones as an empty object too', () => {
    expect(parseToolArguments('')).toEqual({})
    expect(parseToolArguments('{"a":1}')).toEqual({ a: 1 })
    expect(parseToolArguments('{"a":')).toEqual({})
    expect(parseToolArguments('[1,2]')).toEqual({})
  })
})

describe('LangChain message conversion', () => {
  it('carries the calls an assistant turn made under their wire names', () => {
    const message = toLangChainAssistantMessage({
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'call_1', name: 'file.read', arguments: { path: 'a.txt' } }]
    })
    expect(message.tool_calls).toEqual([
      { id: 'call_1', name: 'file__read', args: { path: 'a.txt' }, type: 'tool_call' }
    ])
  })

  it('refuses a tool result that answers no call', () => {
    expect(() => toLangChainToolMessage({ role: 'tool', content: 'x' })).toThrow(
      /TOOL_RESULT_UNPAIRED/
    )
    expect(
      toLangChainToolMessage({ role: 'tool', content: 'x', toolCallId: 'call_1' })
    ).toMatchObject({ tool_call_id: 'call_1' })
  })
})
