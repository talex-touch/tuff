import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import streamIntelligenceHandler from './stream.post'

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
vi.mock('../../../utils/auth', () => authMocks)
vi.mock('../../../utils/tuffIntelligenceLabService', () => intelligenceMocks)

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
