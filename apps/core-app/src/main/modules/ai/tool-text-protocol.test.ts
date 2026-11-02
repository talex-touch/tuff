import { describe, expect, it } from 'vitest'
import { foldToolsIntoPrompt, TOOL_TEXT_PROTOCOL_PROMPT } from './tool-text-protocol'

const readTool = { name: 'file.read', description: 'Read a file', parameters: { type: 'object' } }

describe('foldToolsIntoPrompt', () => {
  it('leaves a payload with no tools and no tool turns exactly as it is', () => {
    const payload = { messages: [{ role: 'user' as const, content: 'hi' }] }
    expect(foldToolsIntoPrompt(payload)).toBe(payload)
  })

  it('puts the protocol first and the tool list after the leading system messages', () => {
    const folded = foldToolsIntoPrompt({
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'read a.txt' }
      ],
      tools: [readTool]
    })
    expect(folded.tools).toBeUndefined()
    expect(folded.messages.map((message) => message.role)).toEqual([
      'system',
      'system',
      'system',
      'user'
    ])
    expect(folded.messages[0].content).toBe(TOOL_TEXT_PROTOCOL_PROMPT)
    expect(folded.messages[1].content).toBe('be brief')
    expect(folded.messages[2].content).toContain('"name":"file.read"')
  })

  it('turns an assistant call and its result into the directive and a named result turn', () => {
    const folded = foldToolsIntoPrompt({
      messages: [
        { role: 'user', content: 'read a.txt' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'file.read', arguments: { path: 'a.txt' } }]
        },
        { role: 'tool', content: 'hello', toolCallId: 'call_1' }
      ],
      tools: [readTool]
    })
    const [, , assistant, result] = folded.messages.slice(-4)
    expect(assistant).toEqual({
      role: 'assistant',
      content: '{"type":"tool","name":"file.read","arguments":{"path":"a.txt"}}'
    })
    expect(result).toEqual({ role: 'user', content: '[Tool result: file.read]\nhello' })
  })

  it('does not add the protocol when there are no tools to describe', () => {
    const folded = foldToolsIntoPrompt({
      messages: [{ role: 'user', content: 'hi' }],
      tools: []
    })
    expect(folded.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(folded.tools).toBeUndefined()
  })

  it('names an unpaired result as unknown instead of dropping it', () => {
    const folded = foldToolsIntoPrompt({
      messages: [{ role: 'tool', content: 'orphan', toolCallId: 'never-issued' }]
    })
    expect(folded.messages).toEqual([{ role: 'user', content: '[Tool result: unknown]\norphan' }])
  })
})
