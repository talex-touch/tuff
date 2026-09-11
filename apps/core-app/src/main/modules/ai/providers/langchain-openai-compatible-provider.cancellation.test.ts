import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'

/**
 * This file deliberately does not mock `@langchain/openai`: the sibling provider tests replace
 * its model class, which cannot prove that a caller AbortSignal reaches the OpenAI client.
 */
vi.mock('../../network', () => ({
  getNetworkService: () => ({
    fetch: (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      globalThis.fetch(url, init)
  })
}))

import { CustomProvider } from './custom-provider'

interface LoopbackOpenAi {
  readonly baseUrl: string
  readonly requestStarted: Promise<void>
  readonly requestCount: () => number
  close: () => Promise<void>
}

async function startLoopbackOpenAi(
  handler: (request: IncomingMessage, response: ServerResponse) => void
): Promise<LoopbackOpenAi> {
  let requestCount = 0
  const requestGate = Promise.withResolvers<void>()
  const server = createServer((request, response) => {
    requestCount += 1
    requestGate.resolve()
    handler(request, response)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port

  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requestStarted: requestGate.promise,
    requestCount: () => requestCount,
    async close(): Promise<void> {
      server.closeAllConnections()
      if (!server.listening) return
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  }
}

function createProvider(baseUrl: string): CustomProvider {
  return new CustomProvider({
    id: 'loopback-openai',
    type: IntelligenceProviderType.CUSTOM,
    name: 'Loopback OpenAI',
    enabled: true,
    apiKey: 'test-only-key',
    baseUrl,
    defaultModel: 'dictation-test',
    models: ['dictation-test'],
    capabilities: ['text.chat'],
    priority: 1
  })
}

function callerSignal(signal: AbortSignal): Parameters<CustomProvider['chat']>[1] {
  return { signal }
}

const prompt = { messages: [{ role: 'user' as const, content: 'say hello' }] }

describe('OpenAI-compatible LangChain cancellation', () => {
  it('does not open HTTP for pre-aborted chat or stream invocations', async () => {
    const server = await startLoopbackOpenAi((_request, response) => {
      response.end('unexpected request')
    })
    try {
      const provider = createProvider(server.baseUrl)
      const controller = new AbortController()
      controller.abort()

      await expect(provider.chat(prompt, callerSignal(controller.signal))).rejects.toThrow()
      await expect(
        provider.chatStream(prompt, callerSignal(controller.signal)).next()
      ).rejects.toThrow()
      expect(server.requestCount()).toBe(0)
    } finally {
      await server.close()
    }
  })

  it('cancels an active LangChain chat and does not retry after the caller has received cancellation', async () => {
    let markClientAbort!: () => void
    const clientAborted = new Promise<void>((resolve) => {
      markClientAbort = resolve
    })
    const server = await startLoopbackOpenAi((_request, response) => {
      response.once('close', markClientAbort)
    })
    try {
      const provider = createProvider(server.baseUrl)
      const controller = new AbortController()
      const request = provider.chat(prompt, callerSignal(controller.signal))

      await server.requestStarted
      controller.abort()

      await expect(request).rejects.toThrow()
      await clientAborted
      // The reported failure issued its retry about 1.8s after the 300ms caller timeout.
      // This must use the real OpenAI retry clock rather than fake timers: the installed client
      // owns that timer and the assertion is specifically about whether it starts another HTTP
      // request after the first socket closes. Keep the loopback server alive past that boundary.
      await new Promise<void>((resolve) => setTimeout(resolve, 4_000))
      expect(server.requestCount()).toBe(1)
    } finally {
      await server.close()
    }
  }, 7_000)

  it('aborts an active LangChain SSE stream after its first delta without retrying or completing', async () => {
    let markClientAbort!: () => void
    const clientAborted = new Promise<void>((resolve) => {
      markClientAbort = resolve
    })
    const server = await startLoopbackOpenAi((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write(
        `data: ${JSON.stringify({
          id: 'chatcmpl-loopback',
          object: 'chat.completion.chunk',
          created: 0,
          model: 'dictation-test',
          choices: [{ index: 0, delta: { content: 'first delta' }, finish_reason: null }]
        })}\n\n`
      )
      response.once('close', markClientAbort)
    })
    try {
      const provider = createProvider(server.baseUrl)
      const controller = new AbortController()
      const stream = provider.chatStream(prompt, callerSignal(controller.signal))

      await expect(stream.next()).resolves.toEqual({
        value: { delta: 'first delta', done: false },
        done: false
      })
      const pendingNext = stream.next()
      controller.abort()

      await expect(pendingNext).rejects.toThrow()
      await clientAborted
      expect(server.requestCount()).toBe(1)
    } finally {
      await server.close()
    }
  })

  it('returns a normal completion through the installed LangChain OpenAI client', async () => {
    const server = await startLoopbackOpenAi((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          id: 'chatcmpl-loopback',
          object: 'chat.completion',
          created: 0,
          model: 'dictation-test',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'completed locally' },
              finish_reason: 'stop'
            }
          ],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
        })
      )
    })
    try {
      const result = await createProvider(server.baseUrl).chat(prompt, {})

      expect(result.result).toBe('completed locally')
      expect(server.requestCount()).toBe(1)
    } finally {
      await server.close()
    }
  })
})
