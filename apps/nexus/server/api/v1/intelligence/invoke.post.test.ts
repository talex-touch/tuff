import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import invokeIntelligenceHandler from './invoke.post'

const routeGlobals = vi.hoisted(() => {
  const originalDefineEventHandler = globalThis.defineEventHandler
  globalThis.defineEventHandler = handler => handler
  return { originalDefineEventHandler }
})

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
}))

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}))

const intelligenceMocks = vi.hoisted(() => ({
  invokeIntelligenceCapability: vi.fn(),
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

async function expectH3Failure(
  request: { body?: unknown, context: Record<string, unknown> },
  expected: { statusCode: number, data: Record<string, unknown> },
) {
  const error = await invokeIntelligenceHandler(request).catch(error => error)
  expect(error).toMatchObject(expected)
}

describe('/api/v1/intelligence/invoke failures', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    h3Mocks.readBody.mockImplementation(async (event: { body?: unknown }) => event.body)
    authMocks.requireAuth.mockResolvedValue({ userId: 'user-1' })
    intelligenceMocks.invokeIntelligenceCapability.mockResolvedValue({ invocationId: 'unused' })
  })

  afterAll(() => {
    if (routeGlobals.originalDefineEventHandler === undefined)
      delete (globalThis as typeof globalThis & { defineEventHandler?: unknown }).defineEventHandler
    else
      globalThis.defineEventHandler = routeGlobals.originalDefineEventHandler
    vi.restoreAllMocks()
  })

  it('returns a canonical quota H3 failure when the invoked service rejects', async () => {
    intelligenceMocks.invokeIntelligenceCapability.mockRejectedValue(quotaError)

    await expectH3Failure({
      body: {
        capabilityId: 'text.chat',
        payload: { messages: [{ role: 'user', content: 'Hello' }] },
      },
      context: {},
    }, {
      statusCode: 429,
      data: {
        code: 'QUOTA_EXHAUSTED',
        message: quotaError.message,
        reason: 'The caller has exhausted its request, token, or cost quota.',
        recovery: 'Wait for quota reset, lower token usage, or adjust quota settings.',
      },
    })
  })

  it('returns a canonical authentication H3 failure when requireAuth rejects', async () => {
    authMocks.requireAuth.mockRejectedValue(new Error('Sign in is required.'))

    await expectH3Failure({
      body: { capabilityId: 'text.chat' },
      context: {},
    }, {
      statusCode: 401,
      data: {
        code: 'NEXUS_AUTH_REQUIRED',
        message: 'Sign in is required.',
        reason: 'Nexus provider requires a signed-in account.',
        recovery: 'Sign in to Nexus or switch to another enabled provider.',
      },
    })
  })

  it('returns a canonical invalid-request H3 failure for a body without capabilityId', async () => {
    await expectH3Failure({
      body: { payload: { text: 'Hello' } },
      context: {},
    }, {
      statusCode: 400,
      data: {
        code: 'INVALID_REQUEST',
        message: 'capabilityId is required.',
        reason: 'The request payload is invalid for this capability.',
        recovery: 'Check the request input and try again.',
      },
    })
  })
})
