import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runIntelligenceAgentGraphStream } from '../intelligenceAgentGraphRunner'

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

const serviceMocks = vi.hoisted(() => ({
  planIntelligenceLab: vi.fn(async () => ({
    objective: 'test objective',
    actions: [
      {
        id: 'action_1',
        title: 'Read account snapshot',
        type: 'tool',
        toolId: 'intelligence.nexus.account.snapshot.get',
        input: {},
        riskLevel: 'low',
      },
    ],
    providerId: 'provider_1',
    providerName: 'Provider 1',
    model: 'gpt-test',
    traceId: 'trace_plan',
    rawModelOutput: '[]',
    fallbackCount: 0,
    retryCount: 0,
  })),
  executeIntelligenceLab: vi.fn(async (_event, _userId, payload, hooks) => {
    const step = {
      actionId: 'action_1',
      title: 'Read account snapshot',
      type: 'tool',
      toolId: 'intelligence.nexus.account.snapshot.get',
      status: 'completed',
      output: { ok: true },
    }
    await hooks?.onStep?.(step as any, {
      index: 1,
      total: 1,
      fallbackCount: 0,
      retryCount: 0,
    })

    return {
      objective: payload.objective,
      results: [step],
      providerId: 'provider_1',
      providerName: 'Provider 1',
      model: 'gpt-test',
      traceId: 'trace_execute',
      fallbackCount: 0,
      retryCount: 0,
    }
  }),
  reflectIntelligenceLab: vi.fn(async () => ({
    summary: 'reflection',
    providerId: 'provider_1',
    providerName: 'Provider 1',
    model: 'gpt-test',
    traceId: 'trace_reflect',
    rawModelOutput: 'reflection',
    fallbackCount: 0,
    retryCount: 0,
  })),
  generateIntelligenceLabFollowUp: vi.fn(async () => ({
    followUp: {
      summary: 'follow up',
      nextActions: ['next'],
      revisitInHours: 24,
    },
    providerId: 'provider_1',
    providerName: 'Provider 1',
    model: 'gpt-test',
    traceId: 'trace_followup',
    rawModelOutput: 'follow up',
    fallbackCount: 0,
    retryCount: 0,
  })),
  buildFinalAssistantReplyWithModel: vi.fn(async (_event, _userId, _payload, options) => {
    await options?.onDelta?.('final delta')
    return {
      message: 'final answer',
      providerId: 'provider_1',
      providerName: 'Provider 1',
      model: 'gpt-test',
      traceId: 'trace_final',
      rawModelOutput: 'final answer',
      streamed: true,
      fallbackCount: 0,
      retryCount: 0,
    }
  }),
}))

const auditMocks = vi.hoisted(() => ({
  createAudit: vi.fn(async () => undefined),
}))

vi.mock('../tuffIntelligenceRuntimeStore', () => stateStoreMocks)
vi.mock('../tuffIntelligenceLabService', () => serviceMocks)
vi.mock('../intelligenceStore', () => auditMocks)

describe('intelligenceAgentGraphRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('默认执行策略不传全局 continueOnError（fail-fast）', async () => {
    const events: Array<{ type?: string }> = []

    await runIntelligenceAgentGraphStream(
      {} as any,
      'user_1',
      {
        message: 'test objective',
        sessionId: 'session_1',
      },
      {
        emit: async (event) => {
          events.push({ type: event.type })
        },
      },
    )

    expect(serviceMocks.executeIntelligenceLab).toHaveBeenCalledTimes(1)
    const executePayload = serviceMocks.executeIntelligenceLab.mock.calls[0]?.[2] as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(executePayload, 'continueOnError')).toBe(false)

    expect(events.some(event => event.type === 'plan.created')).toBe(true)
    expect(events.some(event => event.type === 'execution.step')).toBe(true)
    expect(events.some(event => event.type === 'reflection.completed')).toBe(true)
    expect(events.some(event => event.type === 'done')).toBe(true)
  })
})
