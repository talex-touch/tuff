import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import streamIntelligenceAgentHandler from './stream.post'

const routeGlobals = vi.hoisted(() => {
  const globals = globalThis as typeof globalThis & { readBody?: unknown }
  const originalDefineEventHandler = globalThis.defineEventHandler
  const originalReadBody = globals.readBody
  const readBody = vi.fn()
  globalThis.defineEventHandler = handler => handler
  globals.readBody = readBody
  return { originalDefineEventHandler, originalReadBody, readBody }
})

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const graphMocks = vi.hoisted(() => ({
  runIntelligenceAgentGraphStream: vi.fn(),
}))

const runtimeMocks = vi.hoisted(() => ({
  touchRuntimeSessionHeartbeat: vi.fn(),
}))

const sessionMocks = vi.hoisted(() => ({
  pauseIntelligenceLabSession: vi.fn(),
}))

vi.mock('../../../../utils/auth', () => authMocks)
vi.mock('../../../../utils/intelligenceAgentGraphRunner', () => graphMocks)
vi.mock('../../../../utils/tuffIntelligenceRuntimeStore', () => runtimeMocks)
vi.mock('../../../../utils/tuffIntelligenceLabService', () => sessionMocks)

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('/api/admin/intelligence-agent/session/stream', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    routeGlobals.readBody.mockImplementation(async (event: { body?: unknown }) => event.body)
    authMocks.requireAdmin.mockResolvedValue({ userId: 'admin-1' })
    runtimeMocks.touchRuntimeSessionHeartbeat.mockResolvedValue(undefined)
    sessionMocks.pauseIntelligenceLabSession.mockResolvedValue(undefined)
  })

  afterAll(() => {
    if (routeGlobals.originalDefineEventHandler === undefined)
      delete (globalThis as typeof globalThis & { defineEventHandler?: unknown }).defineEventHandler
    else
      globalThis.defineEventHandler = routeGlobals.originalDefineEventHandler
    const globals = globalThis as typeof globalThis & { readBody?: unknown }
    if (routeGlobals.originalReadBody === undefined)
      delete globals.readBody
    else
      globals.readBody = routeGlobals.originalReadBody
    vi.restoreAllMocks()
  })

  it('flushes each graph event before completion and appends one done frame', async () => {
    const firstEvent = {
      type: 'agent.progress',
      sessionId: 'session-1',
      payload: { step: 'first' },
    }
    const secondEvent = {
      type: 'agent.progress',
      sessionId: 'session-1',
      payload: { step: 'second' },
    }
    const graphGate = deferred()
    let graphGateReleased = false
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined

    graphMocks.runIntelligenceAgentGraphStream.mockImplementation(async (
      _event: unknown,
      _userId: string,
      _input: unknown,
      controls: { emit: (event: typeof firstEvent) => Promise<void> },
    ) => {
      await controls.emit(firstEvent)
      await graphGate.promise
      await controls.emit(secondEvent)
    })

    try {
      const response = await streamIntelligenceAgentHandler({
        body: {
          message: 'Summarize the active session.',
          sessionId: 'session-1',
        },
        context: {},
      })

      expect(response).toBeInstanceOf(Response)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform')
      expect(response.headers.get('Connection')).toBe('keep-alive')

      reader = response.body?.getReader()
      expect(reader).toBeDefined()

      const firstRead = await reader!.read()
      expect(graphGateReleased).toBe(false)
      expect(firstRead.done).toBe(false)
      expect(new TextDecoder().decode(firstRead.value)).toBe(`data: ${JSON.stringify(firstEvent)}\n\n`)

      graphGateReleased = true
      graphGate.resolve()

      const frames = [JSON.parse(new TextDecoder().decode(firstRead.value!).slice('data: '.length))]
      for (;;) {
        const nextRead = await reader!.read()
        if (nextRead.done)
          break
        const frame = new TextDecoder().decode(nextRead.value)
        expect(frame).toMatch(/^data: .*\n\n$/)
        frames.push(JSON.parse(frame.slice('data: '.length)))
      }

      expect(frames).toHaveLength(3)
      expect(frames[0]).toEqual(firstEvent)
      expect(frames[1]).toEqual(secondEvent)
      expect(frames[2]).toMatchObject({
        type: 'done',
        message: 'Stream closed.',
      })
      expect(frames.filter(frame => frame.type === 'done')).toHaveLength(1)
    } finally {
      graphGate.resolve()
      await reader?.cancel().catch(() => undefined)
    }
  })

  it('serializes rejected network errors as canonical safe SSE detail before done', async () => {
    const cause = Object.assign(new Error('nested provider credential failure'), {
      providerToken: 'nested-cause-secret',
    })
    const networkError = Object.assign(new Error('fetch failed: socket reset'), {
      cause,
      name: 'ProviderNetworkError',
      providerApiKey: 'top-secret-network-api-key',
    })
    Object.defineProperty(networkError, 'stack', {
      configurable: true,
      enumerable: true,
      value: 'ProviderNetworkError: fetch failed: socket reset\n    at internal/provider.ts:42:7',
    })
    graphMocks.runIntelligenceAgentGraphStream.mockRejectedValueOnce(networkError)

    const response = await streamIntelligenceAgentHandler({
      body: {
        message: 'Summarize the active session.',
        sessionId: 'session-1',
      },
      context: {},
    })

    expect(response).toBeInstanceOf(Response)
    const reader = response.body?.getReader()
    expect(reader).toBeDefined()

    let serializedFrames = ''
    for (;;) {
      const read = await reader!.read()
      if (read.done)
        break
      serializedFrames += new TextDecoder().decode(read.value)
    }

    const frames = serializedFrames
      .trim()
      .split('\n\n')
      .map(frame => JSON.parse(frame.slice('data: '.length)))
    const errorFrames = frames.filter(frame => frame.type === 'error')

    expect(frames.map(frame => frame.type)).toEqual(['error', 'done'])
    expect(errorFrames).toHaveLength(1)
    expect(errorFrames[0].payload.error).toEqual({
      code: 'NETWORK_FAILURE',
      message: 'fetch failed: socket reset',
      reason: 'The provider request failed before a valid model response was returned.',
      recovery: 'Check network/proxy settings and retry the request.',
    })
    expect(serializedFrames).not.toContain('ProviderNetworkError')
    expect(serializedFrames).not.toContain('nested-cause-secret')
    expect(serializedFrames).not.toContain('top-secret-network-api-key')
    expect(serializedFrames).not.toContain('"stack"')
    expect(serializedFrames).not.toContain('"cause"')
    expect(serializedFrames).not.toContain('"name"')
    expect(serializedFrames).not.toContain('"providerApiKey"')
  })
})
