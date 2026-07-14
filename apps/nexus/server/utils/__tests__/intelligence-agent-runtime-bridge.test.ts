import type { H3Event } from 'h3'
import type { AgentEnvelope } from '@talex-touch/tuff-intelligence'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runIntelligenceAgentGraphStream } from '../intelligenceAgentGraphRunner'
import { clearNexusAgentRuntimePortForTest } from '../intelligenceAgentRuntimeBridge'

const stateStoreMocks = vi.hoisted(() => {
  let seq = 0
  return {
    appendRuntimeTraceEvent: vi.fn(async () => {
      seq += 1
      return { seq }
    }),
    getRuntimeSession: vi.fn(async () => null),
    markRuntimeSessionPaused: vi.fn(async () => undefined),
    saveRuntimeCheckpoint: vi.fn(async () => undefined),
    shouldPauseByHeartbeat: vi.fn(async () => ({ shouldPause: false })),
    upsertRuntimeSession: vi.fn(async () => undefined),
  }
})

vi.mock('../tuffIntelligenceRuntimeStore', () => stateStoreMocks)
vi.mock('../intelligenceStore', () => ({ createAudit: vi.fn(async () => undefined) }))
vi.mock('../tuffIntelligenceLabService', () => ({
  planIntelligenceLab: vi.fn(async () => { throw new Error('unexpected planner call') }),
  executeIntelligenceLab: vi.fn(async () => { throw new Error('unexpected executor call') }),
  reflectIntelligenceLab: vi.fn(async () => { throw new Error('unexpected reflector call') }),
  generateIntelligenceLabFollowUp: vi.fn(async () => { throw new Error('unexpected followup call') }),
  buildFinalAssistantReplyWithModel: vi.fn(async () => { throw new Error('unexpected finalizer call') }),
}))

function createMockEvent(): H3Event {
  // The runtime store is fully mocked in this file, so H3 internals are not observed.
  return {} as unknown as H3Event
}

async function* envelopes(): AsyncIterable<AgentEnvelope> {
  yield {
    version: 'aep/1',
    id: 'evt_1',
    sessionId: 'session_shared',
    turnId: 'turn_1',
    source: 'assistant',
    type: 'assistant.delta',
    ts: '2026-06-18T00:00:00.000Z',
    payload: { text: 'shared delta' },
  }
  yield {
    version: 'aep/1',
    id: 'evt_2',
    sessionId: 'session_shared',
    turnId: 'turn_1',
    source: 'assistant',
    type: 'assistant.final',
    ts: '2026-06-18T00:00:00.000Z',
    payload: { text: 'shared final' },
  }
}

describe('intelligenceAgentGraphRunner shared runtime bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearNexusAgentRuntimePortForTest()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('streams shared AEP envelopes through the Nexus Lab event contract', async () => {
    const emitted: Array<{ type?: string, payload?: Record<string, unknown> }> = []
    const runtimePort = {
      onMessage: vi.fn(async function* () {
        yield* envelopes()
      }),
    }

    const result = await runIntelligenceAgentGraphStream(
      createMockEvent(),
      'user_1',
      { message: 'use shared runtime', sessionId: 'session_shared' },
      { emit: async event => emitted.push(event), runtimePort },
    )

    expect(runtimePort.onMessage).toHaveBeenCalledWith({
      message: 'use shared runtime',
      sessionId: 'session_shared',
      metadata: { nexusAgentRuntimeBridge: true, userId: 'user_1' },
    })
    expect(emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'assistant.delta', payload: { delta: 'shared delta' } }),
      expect.objectContaining({ type: 'done', message: 'shared final' }),
    ]))
    expect(stateStoreMocks.upsertRuntimeSession).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      sessionId: 'session_shared',
      status: 'completed',
      phase: 'done',
    }))
    expect(result).toMatchObject({
      sessionId: 'session_shared',
      objective: 'use shared runtime',
      providerId: 'shared-runtime',
      model: 'shared-runtime',
      metrics: { status: 'completed' },
    })
  })

  it('fails the shared runtime session when the AEP stream never yields before timeout', async () => {
    vi.useFakeTimers()

    const emitted: Array<{
      type?: string
      phase?: string
      message?: string
      payload?: Record<string, unknown>
    }> = []
    const runtimePort = {
      onMessage: vi.fn(async function* () {
        await new Promise<never>(() => {})
      }),
    }

    const resultPromise = runIntelligenceAgentGraphStream(
      createMockEvent(),
      'user_1',
      {
        message: 'runtime stalls',
        sessionId: 'session_timeout',
        timeoutMs: 1_000,
      },
      { emit: async event => emitted.push(event), runtimePort },
    )

    await vi.advanceTimersByTimeAsync(1_000)
    const unresolved = Symbol('unresolved')
    const settled = await Promise.race([
      resultPromise,
      Promise.resolve(unresolved),
    ])

    expect(settled).not.toBe(unresolved)
    if (settled === unresolved)
      throw new Error('Expected shared runtime timeout to settle without waiting indefinitely.')

    expect(settled).toMatchObject({
      sessionId: 'session_timeout',
      objective: 'runtime stalls',
      providerId: 'shared-runtime',
      model: 'shared-runtime',
      metrics: {
        status: 'failed',
        failedActions: 1,
      },
    })
    expect(emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'error',
        phase: 'shared-runtime',
        message: 'shared_runtime_timeout',
        payload: expect.objectContaining({ error: 'shared_runtime_timeout' }),
      }),
    ]))
    expect(stateStoreMocks.upsertRuntimeSession).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      sessionId: 'session_timeout',
      status: 'failed',
      phase: 'shared-runtime',
    }))
  })
})
