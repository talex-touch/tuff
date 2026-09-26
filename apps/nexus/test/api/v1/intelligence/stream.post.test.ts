import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import streamIntelligenceHandler from '../../../../server/api/v1/intelligence/stream.post'

const routeGlobals = vi.hoisted(() => {
  const originalDefineEventHandler = globalThis.defineEventHandler
  globalThis.defineEventHandler = handler => handler
  return { originalDefineEventHandler }
})

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(async (event: { body?: unknown }) => event.body),
}))

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}))

const intelligenceMocks = vi.hoisted(() => ({
  streamIntelligenceCapability: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: h3Mocks.readBody,
  }
})
vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/tuffIntelligenceLabService', () => intelligenceMocks)

const quotaError = {
  code: 'CREDITS_EXCEEDED',
  message: 'Your intelligence request quota is exhausted.',
}

describe('/api/v1/intelligence/stream quota failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAuth.mockResolvedValue({ userId: 'user-1' })
    intelligenceMocks.streamIntelligenceCapability.mockRejectedValue(quotaError)
  })

  afterAll(() => {
    if (routeGlobals.originalDefineEventHandler === undefined)
      delete (globalThis as typeof globalThis & { defineEventHandler?: unknown }).defineEventHandler
    else
      globalThis.defineEventHandler = routeGlobals.originalDefineEventHandler
    vi.restoreAllMocks()
  })

  it('emits one canonical quota error frame and closes without an end frame', async () => {
    const response = await streamIntelligenceHandler({
      body: {
        capabilityId: 'text.chat',
        payload: { messages: [{ role: 'user', content: 'Hello' }] },
      },
      context: {},
    })

    expect(response).toBeInstanceOf(Response)

    const streamText = await response.text()
    const frames = streamText
      .split('\n\n')
      .filter(Boolean)
      .map((frame) => {
        expect(frame).toMatch(/^data: /)
        return JSON.parse(frame.slice('data: '.length))
      })

    expect(frames).toEqual([
      {
        type: 'error',
        code: 'QUOTA_EXHAUSTED',
        message: quotaError.message,
        reason: 'The caller has exhausted its request, token, or cost quota.',
        recovery: 'Wait for quota reset, lower token usage, or adjust quota settings.',
      },
    ])
  })
})

describe('/api/v1/intelligence/stream reasoning effort', () => {
  const decision = { requested: 'high', applied: 'high', status: 'applied' }

  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAuth.mockResolvedValue({ userId: 'user-1' })
    intelligenceMocks.streamIntelligenceCapability.mockImplementation(
      async (_event: unknown, _userId: string, request: { options?: { reasoningEffort?: string } }, hooks: {
        onStart?: (meta: Record<string, unknown>) => void
        onDelta: (delta: string, meta: Record<string, unknown>) => void
      }) => {
        const meta = { capabilityId: 'text.chat', provider: 'ip_openai', model: 'gpt-5.5', traceId: 'trace_1', latency: 1 }
        const reported = request.options?.reasoningEffort ? { reasoningEffort: decision } : {}
        hooks.onStart?.({ ...meta, ...reported })
        hooks.onDelta('ok', meta)
        return {
          capabilityId: 'text.chat',
          result: 'ok',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          model: 'gpt-5.5',
          latency: 1,
          traceId: 'trace_1',
          provider: 'ip_openai',
          metadata: { nexus: true, ...reported },
        }
      },
    )
  })

  async function frames(options: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
    const response = await streamIntelligenceHandler({
      body: { capabilityId: 'text.chat', payload: { messages: [{ role: 'user', content: 'Hello' }] }, options },
      context: {},
    })
    return (await response.text())
      .split('\n\n')
      .filter(Boolean)
      .map(frame => JSON.parse(frame.slice('data: '.length)))
  }

  it('passes a known level to the service and reports the decision on start and usage', async () => {
    const sent = await frames({ reasoningEffort: 'high' })

    expect(intelligenceMocks.streamIntelligenceCapability.mock.calls[0]?.[2].options).toMatchObject({
      reasoningEffort: 'high',
    })
    expect(sent.find(frame => frame.type === 'start')).toMatchObject({ reasoningEffort: decision })
    expect(sent.find(frame => frame.type === 'usage')).toMatchObject({ reasoningEffort: decision })
    // Not repeated on every delta.
    expect(sent.find(frame => frame.type === 'delta')).not.toHaveProperty('reasoningEffort')
  })

  it('drops an unknown level at the boundary and reports nothing', async () => {
    const sent = await frames({ reasoningEffort: 'ultra' })

    expect(intelligenceMocks.streamIntelligenceCapability.mock.calls[0]?.[2].options.reasoningEffort).toBeUndefined()
    expect(sent.some(frame => 'reasoningEffort' in frame)).toBe(false)
  })
})
