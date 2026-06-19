import type { AgentEnvelope } from '@talex-touch/tuff-intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('streams shared AEP envelopes through the Nexus Lab event contract', async () => {
    const emitted: Array<{ type?: string, payload?: Record<string, unknown> }> = []
    const runtimePort = {
      onMessage: vi.fn(async function* () {
        yield* envelopes()
      }),
    }

    const result = await runIntelligenceAgentGraphStream(
      {} as any,
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
})
