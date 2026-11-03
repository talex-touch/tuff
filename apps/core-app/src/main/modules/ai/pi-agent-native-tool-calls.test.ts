import type { AssistantMessage } from '@earendil-works/pi-ai'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { emitModelResponse } from './pi-agent-runtime-worker'

const TOOLS = new Set(['file.read', 'file.list'])

async function run(
  response: Parameters<typeof emitModelResponse>[1],
  runId = 'run_1',
  step = 1
): Promise<AssistantMessage> {
  const stream = createAssistantMessageEventStream()
  emitModelResponse(stream, response, TOOLS, runId, step)
  return await stream.result()
}

const toolCallsOf = (message: AssistantMessage) =>
  message.content.flatMap((block) => (block.type === 'toolCall' ? [block] : []))

describe('emitModelResponse with native tool calls', () => {
  it('turns every call the model made into a tool call, not just the first', async () => {
    const message = await run({
      requestId: 'r',
      runId: 'run_1',
      toolCalls: [
        { id: 'a', name: 'file.read', arguments: { path: 'a.txt' } },
        { id: 'b', name: 'file.list', arguments: { path: '.' } }
      ]
    })
    expect(message.stopReason).toBe('toolUse')
    expect(toolCallsOf(message).map((call) => [call.name, call.arguments])).toEqual([
      ['file.read', { path: 'a.txt' }],
      ['file.list', { path: '.' }]
    ])
  })

  it('gives two identical calls in one step different ids, and the same ids on a replay', async () => {
    const response = {
      requestId: 'r',
      runId: 'run_1',
      toolCalls: [
        { id: 'a', name: 'file.read', arguments: { path: 'a.txt' } },
        { id: 'b', name: 'file.read', arguments: { path: 'a.txt' } }
      ]
    }
    const first = toolCallsOf(await run(response)).map((call) => call.id)
    const replay = toolCallsOf(await run(response)).map((call) => call.id)
    expect(new Set(first).size).toBe(2)
    expect(replay).toEqual(first)
  })

  it('keeps the id a lone call has always had, so a persisted result is still found', async () => {
    const lone = await run({
      requestId: 'r',
      runId: 'run_1',
      toolCalls: [{ id: 'a', name: 'file.read', arguments: { path: 'a.txt' } }]
    })
    const [pair] = toolCallsOf(
      await run({
        requestId: 'r',
        runId: 'run_1',
        toolCalls: [
          { id: 'a', name: 'file.read', arguments: { path: 'a.txt' } },
          { id: 'b', name: 'file.list', arguments: {} }
        ]
      })
    )
    expect(toolCallsOf(lone)[0].id).toBe(pair.id)
  })

  it('ignores a call to a tool that was not offered and answers with the text instead', async () => {
    const message = await run({
      requestId: 'r',
      runId: 'run_1',
      text: 'plain answer',
      toolCalls: [{ id: 'a', name: 'rm.rf', arguments: {} }]
    })
    expect(message.stopReason).toBe('stop')
    expect(message.content).toEqual([{ type: 'text', text: 'plain answer' }])
  })
})
