import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { AnthropicProvider } from './anthropic-provider'

/** Real LangChain and real HTTP against a loopback that speaks Anthropic's SSE event stream. */
async function startLoopback(events: Array<[string, unknown]>) {
  const bodies: Array<Record<string, unknown>> = []
  const server = createServer((request, response) => {
    let raw = ''
    request.on('data', (piece) => (raw += piece))
    request.on('end', () => {
      bodies.push(JSON.parse(raw))
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const [name, data] of events) {
        response.write(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...(data as object) })}\n\n`)
      }
      response.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    bodies,
    async close() {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
}

const READ_FILE = {
  name: 'file.read',
  description: 'Read a file',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
}

const message = {
  message: {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-test',
    content: [],
    stop_reason: null,
    usage: { input_tokens: 5, output_tokens: 0 }
  }
}

function createProvider(baseUrl: string): AnthropicProvider {
  return new AnthropicProvider({
    id: 'loopback-anthropic',
    type: IntelligenceProviderType.ANTHROPIC,
    name: 'Loopback Anthropic',
    enabled: true,
    apiKey: 'test-only-key',
    baseUrl,
    defaultModel: 'claude-test',
    models: [{ id: 'claude-test' }],
    capabilities: ['text.chat'],
    priority: 1
  })
}

describe('Anthropic native tools over HTTP', () => {
  it('sends the tools under wire names and reports the streamed call as part events', async () => {
    const server = await startLoopback([
      ['message_start', message],
      [
        'content_block_start',
        {
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_1', name: 'file__read', input: {} }
        }
      ],
      [
        'content_block_delta',
        { index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":"a' } }
      ],
      [
        'content_block_delta',
        { index: 0, delta: { type: 'input_json_delta', partial_json: '.txt"}' } }
      ],
      ['content_block_stop', { index: 0 }],
      [
        'message_delta',
        { delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 9 } }
      ],
      ['message_stop', {}]
    ])
    try {
      const parts: unknown[] = []
      for await (const piece of createProvider(server.baseUrl).chatStream(
        { messages: [{ role: 'user', content: 'read a.txt' }], tools: [READ_FILE] },
        {}
      )) {
        if (piece.partEvent) parts.push(piece.partEvent)
      }

      expect(parts).toEqual([
        { kind: 'tool-start', callId: 'toolu_1', name: 'file.read' },
        { kind: 'tool-input-end', callId: 'toolu_1', input: { path: 'a.txt' } }
      ])
      expect(server.bodies[0].tools).toEqual([
        { name: 'file__read', description: 'Read a file', input_schema: READ_FILE.parameters }
      ])
    } finally {
      await server.close()
    }
  })

  it('sends a call and its result back as tool_use and tool_result blocks', async () => {
    const server = await startLoopback([
      ['message_start', message],
      ['content_block_start', { index: 0, content_block: { type: 'text', text: '' } }],
      [
        'content_block_delta',
        { index: 0, delta: { type: 'text_delta', text: 'It says hello.' } }
      ],
      ['content_block_stop', { index: 0 }],
      [
        'message_delta',
        { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 4 } }
      ],
      ['message_stop', {}]
    ])
    try {
      let text = ''
      for await (const piece of createProvider(server.baseUrl).chatStream(
        {
          messages: [
            { role: 'user', content: 'read a.txt' },
            {
              role: 'assistant',
              content: '',
              toolCalls: [{ id: 'toolu_1', name: 'file.read', arguments: { path: 'a.txt' } }]
            },
            { role: 'tool', content: 'hello', toolCallId: 'toolu_1' }
          ],
          tools: [READ_FILE]
        },
        {}
      )) {
        text += piece.delta
      }

      expect(text).toBe('It says hello.')
      const turns = server.bodies[0].messages as Array<{ role: string; content: unknown }>
      expect(turns.map((turn) => turn.role)).toEqual(['user', 'assistant', 'user'])
      expect(turns[1].content).toEqual([
        { type: 'tool_use', id: 'toolu_1', name: 'file__read', input: { path: 'a.txt' } }
      ])
      expect(turns[2].content).toEqual([
        { type: 'tool_result', tool_use_id: 'toolu_1', content: 'hello' }
      ])
    } finally {
      await server.close()
    }
  })
})
