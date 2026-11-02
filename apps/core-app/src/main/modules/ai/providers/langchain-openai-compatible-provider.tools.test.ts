import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'

/** Real LangChain and real HTTP: only the host's network service is replaced by global fetch. */
vi.mock('../../network', () => ({
  getNetworkService: () => ({
    fetch: (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      globalThis.fetch(url, init)
  })
}))

import { CustomProvider } from './custom-provider'

interface Loopback {
  readonly baseUrl: string
  readonly bodies: Array<Record<string, unknown>>
  close: () => Promise<void>
}

/** Answers every chat request with the given SSE `data:` payloads, then `[DONE]`. */
async function startLoopback(frames: unknown[]): Promise<Loopback> {
  const bodies: Array<Record<string, unknown>> = []
  const server = createServer((request, response) => {
    let raw = ''
    request.on('data', (piece) => (raw += piece))
    request.on('end', () => {
      bodies.push(JSON.parse(raw))
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const frame of frames) response.write(`data: ${JSON.stringify(frame)}\n\n`)
      response.end('data: [DONE]\n\n')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    bodies,
    async close() {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
}

function createProvider(baseUrl: string): CustomProvider {
  return new CustomProvider({
    id: 'loopback-tools',
    type: IntelligenceProviderType.CUSTOM,
    name: 'Loopback Tools',
    enabled: true,
    apiKey: 'test-only-key',
    baseUrl,
    defaultModel: 'tools-test',
    models: [{ id: 'tools-test' }],
    capabilities: ['text.chat'],
    priority: 1
  })
}

const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({
  id: 'chatcmpl-1',
  object: 'chat.completion.chunk',
  created: 1,
  model: 'tools-test',
  choices: [{ index: 0, delta, finish_reason: finish }]
})

const READ_FILE = {
  name: 'file.read',
  description: 'Read a file',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
}

async function collect(stream: AsyncGenerator<{ delta: string; partEvent?: unknown }>) {
  const parts: unknown[] = []
  let text = ''
  for await (const piece of stream) {
    text += piece.delta
    if (piece.partEvent) parts.push(piece.partEvent)
  }
  return { text, parts }
}

describe('OpenAI-compatible native tools over HTTP', () => {
  it('sends the tools under wire names and reports the streamed call as part events', async () => {
    const server = await startLoopback([
      chunk({ role: 'assistant', content: null }),
      chunk({
        tool_calls: [
          {
            index: 0,
            id: 'call_9',
            type: 'function',
            function: { name: 'file__read', arguments: '' }
          }
        ]
      }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '{"path":"a' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '.txt"}' } }] }),
      chunk({}, 'tool_calls')
    ])
    try {
      const { text, parts } = await collect(
        createProvider(server.baseUrl).chatStream(
          { messages: [{ role: 'user', content: 'read a.txt' }], tools: [READ_FILE] },
          {}
        )
      )

      expect(text).toBe('')
      expect(parts).toEqual([
        { kind: 'tool-start', callId: 'call_9', name: 'file.read' },
        { kind: 'tool-input-end', callId: 'call_9', input: { path: 'a.txt' } }
      ])
      const [body] = server.bodies
      expect(body.tools).toEqual([
        {
          type: 'function',
          function: {
            name: 'file__read',
            description: 'Read a file',
            parameters: READ_FILE.parameters
          }
        }
      ])
    } finally {
      await server.close()
    }
  })

  it('sends a call and its result back as a paired assistant and tool message', async () => {
    const server = await startLoopback([chunk({ content: 'It says hello.' }, 'stop')])
    try {
      const { text, parts } = await collect(
        createProvider(server.baseUrl).chatStream(
          {
            messages: [
              { role: 'user', content: 'read a.txt' },
              {
                role: 'assistant',
                content: '',
                toolCalls: [{ id: 'call_9', name: 'file.read', arguments: { path: 'a.txt' } }]
              },
              { role: 'tool', content: 'hello', toolCallId: 'call_9' }
            ],
            tools: [READ_FILE]
          },
          {}
        )
      )

      expect(text).toBe('It says hello.')
      expect(parts).toEqual([])
      const messages = server.bodies[0].messages as Array<Record<string, unknown>>
      expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'tool'])
      expect(messages[1].tool_calls).toEqual([
        {
          id: 'call_9',
          type: 'function',
          function: { name: 'file__read', arguments: '{"path":"a.txt"}' }
        }
      ])
      expect(messages[2]).toMatchObject({ tool_call_id: 'call_9', content: 'hello' })
    } finally {
      await server.close()
    }
  })

  it('sends no tools field when the request has none', async () => {
    const server = await startLoopback([chunk({ content: 'hi' }, 'stop')])
    try {
      await collect(
        createProvider(server.baseUrl).chatStream(
          { messages: [{ role: 'user', content: 'hello' }] },
          {}
        )
      )
      expect(server.bodies[0]).not.toHaveProperty('tools')
    } finally {
      await server.close()
    }
  })
})
