import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { PiModelStreamBuffer } from './pi-model-stream-buffer'
import { emitModelResponse, parseBridgeResponse } from './pi-agent-runtime-worker'

describe('pi-agent bridge response parsing and repairs', () => {
  const toolNames = new Set([
    'system.exec',
    'bash',
    'file.write',
    'browser.search',
    'browser.extract'
  ])

  it('parses valid tool call JSON', () => {
    const input = JSON.stringify({
      type: 'tool',
      name: 'system.exec',
      arguments: { command: 'echo "hello"' }
    })
    const result = parseBridgeResponse(input, toolNames)
    expect(result).toEqual({
      type: 'tool',
      name: 'system.exec',
      arguments: { command: 'echo "hello"' }
    })
  })

  it('recovers unescaped multiline python command from user screenshot failure case', () => {
    const brokenGeminiOutput = `{"type":"tool","name":"system.exec","arguments":{"command":"python3 -c "
import json, random
from datetime import datetime, timedelta

random.seed(42)
start_date = datetime(2026, 1, 1)
products = ['Tuff Pro 会员', 'Talex 协同套件', 'AI 灵感引擎点卡', '云存储扩展包']
channels = ['官网直接销售', '应用内推荐', '渠道分销', '企业大宗采购']

data = []
base_prices = {'Tuff Pro 会员': 199, 'Talex 协同套件': 599, 'AI 灵感引擎点卡': 50, '云存储扩展包': 88}

for day_offset in range(30):
    cur_date = (start_date + timedelta(days=day_offset)).strftime('%Y-%m-%d')
    num_orders = random.randint(15, 30)
    for _ in range(num_orders):
        p = random.choice(products)
        qty = random.choices([1, 2, 3, 5, 10], weights=[60, 20, 10, 7, 3])[0]
        channel = random.choice(channels)
        unit_price = base_prices[p]
        discount = random.choice([1.0, 1.0, 0.95, 0.9, 0.85])
        revenue = round(unit_price * qty * discount, 2)
        data.append({
            'date': cur_date,
            'product': p,
            'channel': channel,
            'quantity': qty
        })
print("OK")
`
    const result = parseBridgeResponse(brokenGeminiOutput, toolNames)
    expect(result.type).toBe('tool')
    if (result.type === 'tool') {
      expect(result.name).toBe('system.exec')
      expect(result.arguments.command).toBeDefined()
      expect(typeof result.arguments.command).toBe('string')
      expect(result.arguments.command).toContain('python3 -c')
      expect(result.arguments.command).toContain('Talex 协同套件')
    }
  })

  it('repairs unescaped newlines in JSON strings for file.write', () => {
    const multilineFileWrite = `{"type":"tool","name":"file.write","arguments":{"path":"sales.py","content":"import os
print('writing file')
"}}`
    const result = parseBridgeResponse(multilineFileWrite, toolNames)
    expect(result.type).toBe('tool')
    if (result.type === 'tool') {
      expect(result.name).toBe('file.write')
      expect(result.arguments.path).toBe('sales.py')
      expect(result.arguments.content).toBe("import os\nprint('writing file')\n")
    }
  })

  it('preserves plain conversation text as final message', () => {
    const plainText = '好的，我已经为你准备好了模拟销售数据变化的文件方案。'
    const result = parseBridgeResponse(plainText, toolNames)
    expect(result).toEqual({
      type: 'final',
      text: plainText
    })
  })

  it('handles type: final JSON directive', () => {
    const finalDirective = JSON.stringify({
      type: 'final',
      text: '这是最终回复内容。'
    })
    const result = parseBridgeResponse(finalDirective, toolNames)
    expect(result).toEqual({
      type: 'final',
      text: '这是最终回复内容。'
    })
  })

  it('passes a well-formed call to a tool outside the run through, so the loop can answer it', () => {
    const bare = '{"type":"tool","name":"file.list","arguments":{"path":"."}}'
    expect(parseBridgeResponse(bare, toolNames)).toEqual({
      type: 'tool',
      name: 'file.list',
      arguments: { path: '.' }
    })
    expect(parseBridgeResponse('```json\n' + bare + '\n```', toolNames)).toMatchObject({
      type: 'tool',
      name: 'file.list'
    })
  })

  it('reports a corrupted tool directive as an invalid call instead of failing the run', () => {
    const corruptedToolDirective =
      '{"type":"tool","name":"system.exec", broken json without arguments'
    expect(parseBridgeResponse(corruptedToolDirective, toolNames)).toMatchObject({
      type: 'invalid',
      name: 'system.exec'
    })
  })

  it('keeps the prose after a complete tool call as text beside the call', () => {
    const reply =
      '{"type":"tool","name":"browser.search","arguments":{"query":"Warp"}}Warp 是一款终端。'
    expect(parseBridgeResponse(reply, toolNames)).toEqual({
      type: 'tool',
      name: 'browser.search',
      arguments: { query: 'Warp' },
      text: 'Warp 是一款终端。'
    })
  })

  it('does not fold prose after a complete system.exec call into its command', () => {
    const reply =
      '{"type":"tool","name":"system.exec","arguments":{"command":"echo done"}}\n\n这是输出。'
    expect(parseBridgeResponse(reply, toolNames)).toEqual({
      type: 'tool',
      name: 'system.exec',
      arguments: { command: 'echo done' },
      text: '这是输出。'
    })
  })

  it('does not fold prose after a complete file.write call into its content', () => {
    const reply =
      '{"type":"tool","name":"file.write","arguments":{"path":"a.txt","content":"hi"}}\n\n已写入。'
    expect(parseBridgeResponse(reply, toolNames)).toEqual({
      type: 'tool',
      name: 'file.write',
      arguments: { path: 'a.txt', content: 'hi' },
      text: '已写入。'
    })
  })

  it('delivers a long answer that merely quotes the tool envelope as the final text', () => {
    const answer = [
      '## 工具调用约定',
      '需要工具时,只回复一个 JSON 对象:',
      '```json',
      '{"type":"tool","name":"tool.name","arguments":{}}',
      '```',
      '不需要工具时直接回复纯文本,例如 `type ToolAction = { type: "tool", name: string }`。'
    ].join('\n')
    expect(parseBridgeResponse(answer, toolNames)).toEqual({ type: 'final', text: answer })
  })

  it('does not rebuild a tool call from a name quoted inside prose', () => {
    const prose =
      '示例:{"type":"tool","name":"system.exec","arguments":{"command":"ls"}} 这就是格式。'
    expect(parseBridgeResponse(prose, toolNames)).toEqual({ type: 'final', text: prose })
  })

  it('parses multiple space-separated tool directives from the screenshot regression without leaking text', async () => {
    const reply =
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC 1-RTT handshake server can send application data 0.5 RTT client Finished transport parameters Initial TLS 1.3 TCP three-way handshake TLS RTT comparison","provider":"google","open":false}} ' +
      '{"type":"tool","name":"browser.extract","arguments":{"url":"https://www.rfc-editor.org/rfc/rfc9001.html"}} ' +
      '{"type":"tool","name":"browser.extract","arguments":{"url":"https://www.rfc-editor.org/rfc/rfc9000.html"}}'

    const parsed = parseBridgeResponse(reply, toolNames)
    expect(parsed).toEqual({
      type: 'tool',
      name: 'browser.search',
      arguments: {
        query:
          'QUIC 1-RTT handshake server can send application data 0.5 RTT client Finished transport parameters Initial TLS 1.3 TCP three-way handshake TLS RTT comparison',
        provider: 'google',
        open: false
      },
      calls: [
        {
          name: 'browser.search',
          arguments: {
            query:
              'QUIC 1-RTT handshake server can send application data 0.5 RTT client Finished transport parameters Initial TLS 1.3 TCP three-way handshake TLS RTT comparison',
            provider: 'google',
            open: false
          }
        },
        {
          name: 'browser.extract',
          arguments: { url: 'https://www.rfc-editor.org/rfc/rfc9001.html' }
        },
        {
          name: 'browser.extract',
          arguments: { url: 'https://www.rfc-editor.org/rfc/rfc9000.html' }
        }
      ]
    })

    const stream = createAssistantMessageEventStream()
    emitModelResponse(
      stream,
      { requestId: 'r1', runId: 'run_1', text: reply },
      toolNames,
      'run_1',
      1
    )
    const message = await stream.result()
    expect(message.stopReason).toBe('toolUse')
    expect(message.content.filter((b) => b.type === 'text')).toEqual([])
    expect(
      message.content.filter((b) => b.type === 'toolCall').map((b) => [b.name, b.arguments])
    ).toEqual([
      [
        'browser.search',
        {
          query:
            'QUIC 1-RTT handshake server can send application data 0.5 RTT client Finished transport parameters Initial TLS 1.3 TCP three-way handshake TLS RTT comparison',
          provider: 'google',
          open: false
        }
      ],
      ['browser.extract', { url: 'https://www.rfc-editor.org/rfc/rfc9001.html' }],
      ['browser.extract', { url: 'https://www.rfc-editor.org/rfc/rfc9000.html' }]
    ])
  })

  it('parses multi-tool replies separated by newlines, commas, fences, or wrapped in a JSON array', () => {
    const fenced = [
      '```json',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}',
      '```',
      '```json',
      '{"type":"tool","name":"browser.extract","arguments":{"url":"https://www.rfc-editor.org/rfc/rfc9000.html"}}',
      '```'
    ].join('\n')
    expect(parseBridgeResponse(fenced, toolNames)).toMatchObject({
      type: 'tool',
      calls: [
        { name: 'browser.search', arguments: { query: 'QUIC' } },
        {
          name: 'browser.extract',
          arguments: { url: 'https://www.rfc-editor.org/rfc/rfc9000.html' }
        }
      ]
    })

    const jsonArray = JSON.stringify([
      { type: 'tool', name: 'browser.search', arguments: { query: 'QUIC' } },
      { type: 'tool', name: 'browser.extract', arguments: { url: 'https://example.com' } }
    ])
    expect(parseBridgeResponse(jsonArray, toolNames)).toMatchObject({
      type: 'tool',
      calls: [
        { name: 'browser.search', arguments: { query: 'QUIC' } },
        { name: 'browser.extract', arguments: { url: 'https://example.com' } }
      ]
    })

    const commaSeparated =
      '{"type":"tool","name":"browser.search","arguments":{"query":"a"}}, {"type":"tool","name":"browser.extract","arguments":{"url":"https://b"}}'
    expect(parseBridgeResponse(commaSeparated, toolNames)).toMatchObject({
      type: 'tool',
      calls: [
        { name: 'browser.search', arguments: { query: 'a' } },
        { name: 'browser.extract', arguments: { url: 'https://b' } }
      ]
    })
  })

  it('never leaks a corrupted follow-up tool directive into user text', () => {
    const reply =
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}} ' +
      '{"type":"tool","name":"browser.extract", broken json'
    const parsed = parseBridgeResponse(reply, toolNames)
    expect(parsed.type).toBe('tool')
    if (parsed.type === 'tool') {
      expect(parsed.text).toBeUndefined()
      expect(parsed.calls).toHaveLength(2)
      expect(parsed.calls?.[0]).toEqual({ name: 'browser.search', arguments: { query: 'QUIC' } })
      expect(parsed.calls?.[1]?.name).toBe('browser.extract')
      expect(typeof parsed.calls?.[1]?.arguments.__invalidToolCall).toBe('string')
    }
  })

  it('extracts standalone trailing tool directives after preamble prose without leaking JSON', () => {
    const reply = [
      '我先查一下 QUIC 1-RTT 握手的相关规范。',
      '',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC 1-RTT"}} {"type":"tool","name":"browser.extract","arguments":{"url":"https://www.rfc-editor.org/rfc/rfc9001.html"}}'
    ].join('\n')

    expect(parseBridgeResponse(reply, toolNames)).toEqual({
      type: 'tool',
      name: 'browser.search',
      arguments: { query: 'QUIC 1-RTT' },
      calls: [
        { name: 'browser.search', arguments: { query: 'QUIC 1-RTT' } },
        {
          name: 'browser.extract',
          arguments: { url: 'https://www.rfc-editor.org/rfc/rfc9001.html' }
        }
      ],
      text: '我先查一下 QUIC 1-RTT 握手的相关规范。'
    })
  })

  it('does not treat tool JSON inside an open markdown code block as a trailing call', () => {
    const answer = [
      '示例：',
      '```json',
      '{"note": "demo"}',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}',
      '```'
    ].join('\n')
    expect(parseBridgeResponse(answer, toolNames)).toEqual({ type: 'final', text: answer })
  })

  it('keeps a leading mixed JSON fence intact as text without accepting partial calls or stripping its opener', () => {
    const mixed = [
      '```json',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}',
      '{"note":"ordinary"}',
      '```'
    ].join('\n')
    expect(parseBridgeResponse(mixed, toolNames)).toEqual({ type: 'final', text: mixed })

    const fencedThenProse = [
      '```json',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}',
      '```',
      '正在查询 QUIC 规范。'
    ].join('\n')
    expect(parseBridgeResponse(fencedThenProse, toolNames)).toEqual({
      type: 'tool',
      name: 'browser.search',
      arguments: { query: 'QUIC' },
      text: '正在查询 QUIC 规范。'
    })
  })

  it('respects CommonMark fence lengths so a shorter inner fence never closes a 4-backtick block, while recognizing calls after a valid closer', () => {
    const insideFourBackticks = [
      '示例：',
      '````markdown',
      '```',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}',
      '````'
    ].join('\n')
    expect(parseBridgeResponse(insideFourBackticks, toolNames)).toEqual({
      type: 'final',
      text: insideFourBackticks
    })

    const afterValidCloser = [
      '示例：',
      '````markdown',
      '```',
      'nested',
      '```',
      '````',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}'
    ].join('\n')
    expect(parseBridgeResponse(afterValidCloser, toolNames)).toEqual({
      type: 'tool',
      name: 'browser.search',
      arguments: { query: 'QUIC' },
      text: ['示例：', '````markdown', '```', 'nested', '```', '````'].join('\n')
    })
  })
})

describe('PiModelStreamBuffer UI leak prevention', () => {
  const toolNames = new Set(['system.exec', 'file.write', 'browser.search', 'browser.extract'])

  function streamWith(
    payload: string,
    chunkSize: number,
    options?: { toolNames?: ReadonlySet<string> }
  ): string {
    const deltas: string[] = []
    const buffer = new PiModelStreamBuffer((d) => deltas.push(d), options)
    for (let i = 0; i < payload.length; i += chunkSize) {
      buffer.pushDelta(payload.slice(i, i + chunkSize))
    }
    buffer.complete()
    return deltas.join('')
  }

  it('suppresses tool call JSON tokens from streaming into user bubble', () => {
    const deltas: string[] = []
    const buffer = new PiModelStreamBuffer((d) => deltas.push(d))

    buffer.pushDelta('{"type"')
    buffer.pushDelta(':"tool"')
    buffer.pushDelta(',"name":"system.exec"')
    buffer.pushDelta(',"arguments":{"command":"python3 -c "')
    buffer.complete()

    expect(deltas).toEqual([])
  })

  it('suppresses markdown fenced tool call tokens from streaming into user bubble', () => {
    const deltas: string[] = []
    const buffer = new PiModelStreamBuffer((d) => deltas.push(d))

    buffer.pushDelta('```json\n{"type":"tool"')
    buffer.pushDelta(',"name":"file.write"')
    buffer.complete()

    expect(deltas).toEqual([])
  })

  it('suppresses JSON array and alternate-key-order tool calls at stream start', () => {
    const arrayDeltas: string[] = []
    const arrayBuffer = new PiModelStreamBuffer((d) => arrayDeltas.push(d), { toolNames })
    arrayBuffer.pushDelta('[{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}]')
    arrayBuffer.complete()
    expect(arrayDeltas).toEqual([])

    const altDeltas: string[] = []
    const altBuffer = new PiModelStreamBuffer((d) => altDeltas.push(d), { toolNames })
    altBuffer.pushDelta('{"name":"browser.search","type":"tool","arguments":{"query":"QUIC"}}')
    altBuffer.complete()
    expect(altDeltas).toEqual([])

    const argsFirst = '{"arguments":{"query":"QUIC"},"type":"tool","name":"browser.search"}'
    expect(streamWith(argsFirst, 1, { toolNames })).toBe('')
    expect(parseBridgeResponse(argsFirst, toolNames)).toEqual({
      type: 'tool',
      name: 'browser.search',
      arguments: { query: 'QUIC' }
    })
  })

  it('suppresses trailing tool directives after preamble prose across multi-chunk and single-chunk streams with worker parity', () => {
    const payload =
      '我先查一下 QUIC 1-RTT 握手。\n\n' +
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}} ' +
      '{"type":"tool","name":"browser.extract","arguments":{"url":"https://www.rfc-editor.org/rfc/rfc9001.html"}}'

    const parsed = parseBridgeResponse(payload, toolNames)
    expect(parsed).toEqual({
      type: 'tool',
      name: 'browser.search',
      arguments: { query: 'QUIC' },
      calls: [
        { name: 'browser.search', arguments: { query: 'QUIC' } },
        {
          name: 'browser.extract',
          arguments: { url: 'https://www.rfc-editor.org/rfc/rfc9001.html' }
        }
      ],
      text: '我先查一下 QUIC 1-RTT 握手。'
    })

    // Single chunk and character-by-character chunks match parseBridgeResponse.text
    expect(streamWith(payload, payload.length, { toolNames })).toBe('我先查一下 QUIC 1-RTT 握手。')
    expect(streamWith(payload, 1, { toolNames })).toBe('我先查一下 QUIC 1-RTT 握手。')
  })

  it('retains an unoffered envelope as text while still suppressing a following offered trailing call', () => {
    const bareReply = [
      '说明如下：',
      '{"type":"tool","name":"unoffered.demo","arguments":{"k":1}}',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}'
    ].join('\n')
    const expectedText = [
      '说明如下：',
      '{"type":"tool","name":"unoffered.demo","arguments":{"k":1}}'
    ].join('\n')
    expect(parseBridgeResponse(bareReply, toolNames)).toEqual({
      type: 'tool',
      name: 'browser.search',
      arguments: { query: 'QUIC' },
      text: expectedText
    })
    expect(streamWith(bareReply, bareReply.length, { toolNames })).toBe(expectedText)
    expect(streamWith(bareReply, 1, { toolNames })).toBe(expectedText)

    const fencedReply = [
      '说明如下：',
      '```json',
      '{"type":"tool","name":"unoffered.demo","arguments":{"k":1}}',
      '```',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}'
    ].join('\n')
    const expectedFencedText = [
      '说明如下：',
      '```json',
      '{"type":"tool","name":"unoffered.demo","arguments":{"k":1}}',
      '```'
    ].join('\n')
    expect(parseBridgeResponse(fencedReply, toolNames)).toEqual({
      type: 'tool',
      name: 'browser.search',
      arguments: { query: 'QUIC' },
      text: expectedFencedText
    })
    expect(streamWith(fencedReply, fencedReply.length, { toolNames })).toBe(expectedFencedText)
    expect(streamWith(fencedReply, 1, { toolNames })).toBe(expectedFencedText)
  })

  it('holds key-reordered trailing tool envelopes while releasing ordinary JSON objects', () => {
    const argsFirstTrailing = [
      '正在检索：',
      '{"arguments":{"query":"QUIC"},"type":"tool","name":"browser.search"}'
    ].join('\n')
    expect(parseBridgeResponse(argsFirstTrailing, toolNames)).toEqual({
      type: 'tool',
      name: 'browser.search',
      arguments: { query: 'QUIC' },
      text: '正在检索：'
    })
    expect(streamWith(argsFirstTrailing, argsFirstTrailing.length, { toolNames })).toBe(
      '正在检索：'
    )
    expect(streamWith(argsFirstTrailing, 3, { toolNames })).toBe('正在检索：')

    const ordinaryJson = [
      '配置示例：',
      '{"arguments":{"host":"localhost"},"port":3000}',
      '结束。'
    ].join('\n')
    expect(parseBridgeResponse(ordinaryJson, toolNames)).toEqual({
      type: 'final',
      text: ordinaryJson
    })
    expect(streamWith(ordinaryJson, 5, { toolNames })).toBe(ordinaryJson)
  })

  it('matches CommonMark fence tracking in stream buffer for 4-backtick blocks and mixed fences', () => {
    const insideFourBackticks = [
      '示例：',
      '````markdown',
      '```',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}',
      '````'
    ].join('\n')
    expect(streamWith(insideFourBackticks, 4, { toolNames })).toBe(insideFourBackticks)

    const afterValidCloser = [
      '示例：',
      '````markdown',
      '```',
      'nested',
      '```',
      '````',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}'
    ].join('\n')
    const expectedPreamble = ['示例：', '````markdown', '```', 'nested', '```', '````'].join('\n')
    expect(streamWith(afterValidCloser, afterValidCloser.length, { toolNames })).toBe(
      expectedPreamble
    )
    expect(streamWith(afterValidCloser, 2, { toolNames })).toBe(expectedPreamble)

    const leadingMixedFence = [
      '```json',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}',
      '{"note":"ordinary"}',
      '```'
    ].join('\n')
    expect(streamWith(leadingMixedFence, 5, { toolNames })).toBe(leadingMixedFence)
  })

  it('scans large trailing tool directives incrementally in linear time without leaking text', () => {
    const largeContent = 'x'.repeat(50_000)
    const payload = `准备写入文件。\n${JSON.stringify({
      type: 'tool',
      name: 'file.write',
      arguments: { path: 'big.txt', content: largeContent }
    })}`

    const start = performance.now()
    const streamed = streamWith(payload, 5, { toolNames })
    const elapsedMs = performance.now() - start

    expect(streamed).toBe('准备写入文件。')
    expect(elapsedMs).toBeLessThan(2000)

    const fencedPayload = [
      '准备写入文件。',
      '```json',
      JSON.stringify({
        type: 'tool',
        name: 'file.write',
        arguments: { path: 'big.txt', content: largeContent }
      }),
      '```'
    ].join('\n')
    const fencedStart = performance.now()
    const fencedStreamed = streamWith(fencedPayload, 5, { toolNames })
    const fencedElapsedMs = performance.now() - fencedStart

    expect(fencedStreamed).toBe('准备写入文件。')
    expect(fencedElapsedMs).toBeLessThan(2000)
  })

  it('handles 4-space indented fence markers, NBSP whitespace, incomplete JSON tails, and 10k-line single deltas iteratively', () => {
    // 4-space indented ``` inside a text fence is NOT a CommonMark closer.
    const indentedCloser = [
      '示例：',
      '```text',
      '    ```',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}'
    ].join('\n')
    expect(parseBridgeResponse(indentedCloser, toolNames)).toEqual({
      type: 'final',
      text: indentedCloser
    })
    expect(streamWith(indentedCloser, 5, { toolNames })).toBe(indentedCloser)

    // U+00A0 NBSP before a trailing JSON directive matches whole-response whitespace trimming.
    const nbspTrailing =
      '正在搜索。\n\u00A0{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}'
    expect(parseBridgeResponse(nbspTrailing, toolNames)).toEqual({
      type: 'tool',
      name: 'browser.search',
      arguments: { query: 'QUIC' },
      text: '正在搜索。'
    })
    expect(streamWith(nbspTrailing, 3, { toolNames })).toBe('正在搜索。')

    // Incomplete JSON on line 2 followed by a valid offered directive on line 3: suppress only line 3.
    const incompleteThenOffered = [
      'Checking.',
      '{"note":',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}'
    ].join('\n')
    expect(parseBridgeResponse(incompleteThenOffered, toolNames)).toEqual({
      type: 'tool',
      name: 'browser.search',
      arguments: { query: 'QUIC' },
      text: 'Checking.\n{"note":'
    })
    expect(streamWith(incompleteThenOffered, 4, { toolNames })).toBe('Checking.\n{"note":')
    expect(streamWith(incompleteThenOffered, incompleteThenOffered.length, { toolNames })).toBe(
      'Checking.\n{"note":'
    )

    // 10,000-line single delta must run iteratively without stack overflow.
    const manyLines = Array.from({ length: 10_000 }, (_, i) => `line ${i}`).join('\n')
    expect(streamWith(manyLines, manyLines.length, { toolNames })).toBe(manyLines)
  })

  it('flushes documentation answers that quote tool envelopes intact', () => {
    const doc = [
      '## 工具调用约定',
      '需要工具时,只回复一个 JSON 对象:',
      '```json',
      '{"type":"tool","name":"tool.name","arguments":{}}',
      '```',
      '不需要工具时直接回复纯文本。'
    ].join('\n')

    const deltas: string[] = []
    const buffer = new PiModelStreamBuffer((d) => deltas.push(d), { toolNames })
    for (let i = 0; i < doc.length; i += 7) {
      buffer.pushDelta(doc.slice(i, i + 7))
    }
    buffer.complete()

    expect(deltas.join('')).toBe(doc)
  })

  it('preserves non-json code blocks containing tool JSON examples', () => {
    const doc = [
      '```text',
      '{"type":"tool","name":"browser.search","arguments":{"query":"QUIC"}}',
      '```'
    ].join('\n')

    const deltas: string[] = []
    const buffer = new PiModelStreamBuffer((d) => deltas.push(d), { toolNames })
    buffer.pushDelta(doc)
    buffer.complete()

    expect(deltas.join('')).toBe(doc)
  })

  it('flushes and streams plain conversation text directly to user bubble', () => {
    const deltas: string[] = []
    const buffer = new PiModelStreamBuffer((d) => deltas.push(d))

    buffer.pushDelta('好的，')
    buffer.pushDelta('我来帮你做这个文件。')
    buffer.complete()

    expect(deltas).toEqual(['好的，', '我来帮你做这个文件。'])
  })

  it('marks tool mode explicitly when native tool-start event is observed', () => {
    const deltas: string[] = []
    const buffer = new PiModelStreamBuffer((d) => deltas.push(d))

    buffer.markTool()
    buffer.pushDelta('ignored stream delta')
    buffer.complete()

    expect(deltas).toEqual([])
  })
})
