import { describe, expect, it } from 'vitest'
import { PiModelStreamBuffer } from './pi-model-stream-buffer'
import { parseBridgeResponse } from './pi-agent-runtime-worker'

describe('pi-agent bridge response parsing and repairs', () => {
  const toolNames = new Set(['system.exec', 'bash', 'file.write', 'browser.search'])

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
    const corruptedToolDirective = '{"type":"tool","name":"system.exec", broken json without arguments'
    expect(parseBridgeResponse(corruptedToolDirective, toolNames)).toMatchObject({
      type: 'invalid',
      name: 'system.exec'
    })
  })

  it('keeps the prose after a complete tool call as text beside the call', () => {
    const reply = '{"type":"tool","name":"browser.search","arguments":{"query":"Warp"}}Warp 是一款终端。'
    expect(parseBridgeResponse(reply, toolNames)).toEqual({
      type: 'tool',
      name: 'browser.search',
      arguments: { query: 'Warp' },
      text: 'Warp 是一款终端。'
    })
  })

  it('does not fold prose after a complete system.exec call into its command', () => {
    const reply = '{"type":"tool","name":"system.exec","arguments":{"command":"echo done"}}\n\n这是输出。'
    expect(parseBridgeResponse(reply, toolNames)).toEqual({
      type: 'tool',
      name: 'system.exec',
      arguments: { command: 'echo done' },
      text: '这是输出。'
    })
  })

  it('does not fold prose after a complete file.write call into its content', () => {
    const reply = '{"type":"tool","name":"file.write","arguments":{"path":"a.txt","content":"hi"}}\n\n已写入。'
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
    const prose = '示例:{"type":"tool","name":"system.exec","arguments":{"command":"ls"}} 这就是格式。'
    expect(parseBridgeResponse(prose, toolNames)).toEqual({ type: 'final', text: prose })
  })
})

describe('PiModelStreamBuffer UI leak prevention', () => {
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
