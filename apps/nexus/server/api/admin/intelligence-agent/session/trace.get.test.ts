import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import traceIntelligenceAgentHandler from './trace.get'

const routeGlobals = vi.hoisted(() => {
  const globals = globalThis as typeof globalThis & { getQuery?: unknown }
  const originalDefineEventHandler = globalThis.defineEventHandler
  const originalGetQuery = globals.getQuery
  const getQuery = vi.fn()
  globalThis.defineEventHandler = handler => handler
  globals.getQuery = getQuery
  return { originalDefineEventHandler, originalGetQuery, getQuery }
})

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const runtimeMocks = vi.hoisted(() => ({
  listRuntimeTraceEvents: vi.fn(),
}))

vi.mock('../../../../utils/auth', () => authMocks)
vi.mock('../../../../utils/tuffIntelligenceRuntimeStore', () => runtimeMocks)

describe('/api/admin/intelligence-agent/session/trace', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    authMocks.requireAdmin.mockResolvedValue({ userId: 'admin-42' })
    routeGlobals.getQuery.mockImplementation((event: { query?: unknown }) => event.query)
  })

  afterAll(() => {
    if (routeGlobals.originalDefineEventHandler === undefined)
      delete (globalThis as typeof globalThis & { defineEventHandler?: unknown }).defineEventHandler
    else
      globalThis.defineEventHandler = routeGlobals.originalDefineEventHandler
    const globals = globalThis as typeof globalThis & { getQuery?: unknown }
    if (routeGlobals.originalGetQuery === undefined)
      delete globals.getQuery
    else
      globals.getQuery = routeGlobals.originalGetQuery
    vi.restoreAllMocks()
  })

  it('sanitizes historical root and nested errors without rewriting non-error traces', async () => {
    const nestedCause = Object.assign(new Error('legacy provider credential failure'), {
      providerToken: 'nested-cause-secret',
    })
    const nestedNetworkError = Object.assign(new Error('fetch failed: socket reset'), {
      cause: nestedCause,
      name: 'ProviderNetworkError',
      providerApiKey: 'nested-top-secret-network-api-key',
    })
    Object.defineProperty(nestedNetworkError, 'stack', {
      configurable: true,
      enumerable: true,
      value: 'ProviderNetworkError: fetch failed: socket reset\n    at internal/provider.ts:42:7',
    })

    const rootCause = Object.assign(new Error('legacy root credential failure'), {
      accessToken: 'root-cause-secret',
    })
    const rootNetworkError = Object.assign(new Error('fetch failed: gateway timeout'), {
      cause: rootCause,
      name: 'GatewayNetworkError',
      authorization: 'root-top-secret-authorization',
    })
    Object.defineProperty(rootNetworkError, 'stack', {
      configurable: true,
      enumerable: true,
      value: 'GatewayNetworkError: fetch failed: gateway timeout\n    at internal/gateway.ts:7:4',
    })

    const nestedErrorTrace = {
      seq: 8,
      type: 'agent.error',
      payload: {
        attempt: 2,
        error: nestedNetworkError,
      },
    }
    const rootErrorTrace = {
      seq: 9,
      type: 'agent.error',
      error: rootNetworkError,
      payload: { attempt: 3 },
    }
    const nonErrorTrace = {
      seq: 10,
      type: 'agent.progress',
      payload: {
        step: 'retrieving',
        sources: ['memory', 'workspace'],
      },
    }
    const storedTraces = [
      { payload: nestedErrorTrace },
      { payload: rootErrorTrace },
      { payload: nonErrorTrace },
    ]
    runtimeMocks.listRuntimeTraceEvents.mockResolvedValue(storedTraces)

    const response = await traceIntelligenceAgentHandler({
      query: {
        sessionId: ' session-7 ',
        fromSeq: '8',
        limit: '25',
      },
    })

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(runtimeMocks.listRuntimeTraceEvents).toHaveBeenCalledWith(expect.anything(), {
      sessionId: 'session-7',
      userId: 'admin-42',
      fromSeq: 8,
      limit: 25,
    })
    expect(response.traces).toHaveLength(3)
    expect(response.traces[0]).toEqual({
      seq: 8,
      type: 'agent.error',
      payload: {
        attempt: 2,
        error: {
          code: 'NETWORK_FAILURE',
          message: 'fetch failed: socket reset',
          reason: 'The provider request failed before a valid model response was returned.',
          recovery: 'Check network/proxy settings and retry the request.',
        },
      },
    })
    expect(response.traces[1]).toEqual({
      seq: 9,
      type: 'agent.error',
      error: {
        code: 'NETWORK_FAILURE',
        message: 'fetch failed: gateway timeout',
        reason: 'The provider request failed before a valid model response was returned.',
        recovery: 'Check network/proxy settings and retry the request.',
      },
      payload: { attempt: 3 },
    })
    expect(response.traces[2]).toEqual(nonErrorTrace)

    const serializedResponse = JSON.stringify(response)
    for (const forbidden of [
      'ProviderNetworkError',
      'GatewayNetworkError',
      'nested-cause-secret',
      'root-cause-secret',
      'nested-top-secret-network-api-key',
      'root-top-secret-authorization',
      '"stack"',
      '"cause"',
      '"name"',
      '"providerApiKey"',
      '"authorization"',
    ]) {
      expect(serializedResponse).not.toContain(forbidden)
    }

    expect(storedTraces[0].payload).toBe(nestedErrorTrace)
    expect(storedTraces[1].payload).toBe(rootErrorTrace)
    expect(nestedErrorTrace.payload.error).toBe(nestedNetworkError)
    expect(rootErrorTrace.error).toBe(rootNetworkError)
  })
})
