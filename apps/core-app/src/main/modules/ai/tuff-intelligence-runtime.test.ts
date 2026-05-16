import type {
  TuffIntelligenceActionGraph,
  TuffIntelligenceAgentSession,
  TuffIntelligenceApprovalTicket,
  TuffIntelligenceTraceEvent,
  TuffIntelligenceTurn
} from '@talex-touch/tuff-intelligence'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('./agents', () => ({
  agentManager: {
    executeTaskImmediate: vi.fn(),
    shutdown: vi.fn()
  },
  toolRegistry: {
    executeTool: vi.fn()
  }
}))

vi.mock('./intelligence-sdk', () => ({
  tuffIntelligence: {
    invoke: vi.fn()
  }
}))

vi.mock('../database', () => ({
  databaseModule: {
    getDb: vi.fn(() => ({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [])
          })),
          limit: vi.fn(async () => [])
        }))
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(async () => undefined)
        }))
      }))
    }))
  }
}))

interface StoredRuntimeSessionLike {
  session: TuffIntelligenceAgentSession
  turns: TuffIntelligenceTurn[]
  actionGraph: TuffIntelligenceActionGraph
  trace: TuffIntelligenceTraceEvent[]
  approvals: TuffIntelligenceApprovalTicket[]
  toolCallCache: Record<string, unknown>
}

type TuffIntelligenceRuntimeHarness = {
  pushTrace: (
    stored: StoredRuntimeSessionLike,
    event: Omit<TuffIntelligenceTraceEvent, 'id' | 'sessionId' | 'timestamp'>
  ) => void
  loadSession: ReturnType<typeof vi.fn>
  queryTrace: (options: {
    sessionId: string
    fromSeq?: number
    limit?: number
  }) => Promise<TuffIntelligenceTraceEvent[]>
  subscribeSessionTrace: (
    sessionId: string,
    listener: (event: TuffIntelligenceTraceEvent) => void
  ) => () => void
}
let TuffIntelligenceRuntimeCtor: new () => TuffIntelligenceRuntimeHarness

beforeAll(async () => {
  const runtimeModule = await import('./tuff-intelligence-runtime')
  TuffIntelligenceRuntimeCtor =
    runtimeModule.TuffIntelligenceRuntime as unknown as new () => TuffIntelligenceRuntimeHarness
})

function createStoredSession(sessionId: string): StoredRuntimeSessionLike {
  const now = Date.now()
  return {
    session: {
      id: sessionId,
      status: 'executing',
      createdAt: now,
      updatedAt: now
    },
    turns: [],
    actionGraph: {
      sessionId,
      nodes: [],
      edges: [],
      version: 1,
      updatedAt: now
    },
    trace: [],
    approvals: [],
    toolCallCache: {}
  }
}

describe('TuffIntelligenceRuntime trace sequence', () => {
  it('keeps seq monotonic and supports fromSeq replay after trim', async () => {
    const runtime = new TuffIntelligenceRuntimeCtor() as TuffIntelligenceRuntimeHarness
    const stored = createStoredSession('session_seq')

    for (let index = 0; index < 1005; index += 1) {
      runtime.pushTrace(stored, {
        type: 'state.snapshot',
        level: 'info',
        message: `event-${index}`
      })
    }

    runtime.loadSession = vi.fn().mockResolvedValue(stored)

    const events = await runtime.queryTrace({
      sessionId: 'session_seq',
      fromSeq: 1000,
      limit: 2000
    })

    expect(stored.trace).toHaveLength(1000)
    expect(stored.session.lastEventSeq).toBe(1005)
    expect(events).toHaveLength(6)
    expect(events[0]?.seq).toBe(1000)
    expect(events[events.length - 1]?.seq).toBe(1005)
    expect(events.every((event: { contractVersion?: number }) => event.contractVersion === 3)).toBe(
      true
    )
  })

  it('excludes pre-v3 trace events without seq from replay', async () => {
    const runtime = new TuffIntelligenceRuntimeCtor() as TuffIntelligenceRuntimeHarness
    const stored = createStoredSession('session_pre_v3')

    stored.trace = [
      {
        id: 'trace_1',
        sessionId: 'session_pre_v3',
        type: 'session.started',
        level: 'info',
        message: 'started',
        timestamp: 1
      },
      {
        id: 'trace_2',
        sessionId: 'session_pre_v3',
        type: 'plan.created',
        level: 'info',
        message: 'planned',
        timestamp: 2
      },
      {
        id: 'trace_3',
        sessionId: 'session_pre_v3',
        type: 'execution.started',
        level: 'info',
        message: 'executing',
        timestamp: 3
      }
    ]

    runtime.loadSession = vi.fn().mockResolvedValue(stored)

    const replay = await runtime.queryTrace({
      sessionId: 'session_pre_v3',
      fromSeq: 2,
      limit: 10
    })

    expect(stored.trace.map((event) => event.seq)).toEqual([undefined, undefined, undefined])
    expect(stored.session.lastEventSeq).toBeUndefined()
    expect(replay).toEqual([])
  })

  it('releases session trace subscribers after unsubscribe', () => {
    const runtime = new TuffIntelligenceRuntimeCtor() as TuffIntelligenceRuntimeHarness
    const stored = createStoredSession('session_subscribe')
    const onTrace = vi.fn()

    const dispose = runtime.subscribeSessionTrace('session_subscribe', onTrace)

    runtime.pushTrace(stored, {
      type: 'state.snapshot',
      level: 'info',
      message: 'first'
    })

    expect(onTrace).toHaveBeenCalledTimes(1)
    expect(onTrace.mock.calls[0]?.[0]?.seq).toBe(1)

    dispose()

    runtime.pushTrace(stored, {
      type: 'state.snapshot',
      level: 'info',
      message: 'second'
    })

    expect(onTrace).toHaveBeenCalledTimes(1)
  })
})
