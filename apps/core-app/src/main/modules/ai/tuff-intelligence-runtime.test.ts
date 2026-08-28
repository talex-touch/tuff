import type {
  TuffIntelligenceActionGraph,
  TuffIntelligenceAgentSession,
  TuffIntelligenceApprovalTicket,
  TuffIntelligenceStateSnapshot,
  TuffIntelligenceTraceEvent,
  TuffIntelligenceTurn
} from '@talex-touch/tuff-intelligence'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  toolRegistry,
  type ToolExecutionContext,
  type ToolExecutorFn
} from './agents/tool-registry'

vi.mock('./agents', () => ({
  agentManager: {
    executeTaskImmediate: vi.fn(),
    getAvailableAgents: vi.fn(() => []),
    shutdown: vi.fn()
  },
  toolRegistry: {
    executeTool: vi.fn(),
    getAllTools: vi.fn(() => [])
  }
}))

const intelligenceSdkMocks = vi.hoisted(() => ({
  invoke: vi.fn()
}))

const CANARY = 'sk-live-token@/Users/private/native-stack.ts:42'
const registeredToolIds = new Set<string>()

vi.mock('./intelligence-sdk', () => ({
  tuffIntelligence: intelligenceSdkMocks
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
  plan: (payload: {
    sessionId: string
    objective: string
    context?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) => Promise<TuffIntelligenceTurn>
  execute: (payload: {
    sessionId: string
    turnId?: string
    metadata?: Record<string, unknown>
  }) => Promise<TuffIntelligenceTurn>
  startSession: (payload: { sessionId: string }) => Promise<unknown>
  callTool: (payload: {
    sessionId: string
    toolId: string
    input?: unknown
    riskLevel?: TuffIntelligenceApprovalTicket['riskLevel']
    callId?: string
    timeoutMs?: number
    metadata?: Record<string, unknown>
  }) => Promise<{
    success: boolean
    output?: unknown
    error?: string
    errorCode?: string
    approvalTicket?: TuffIntelligenceApprovalTicket
    traceEvent: TuffIntelligenceTraceEvent
  }>
  approveTool: (payload: {
    ticketId: string
    approved: boolean
    approvedBy?: string
    reason?: string
  }) => Promise<TuffIntelligenceApprovalTicket | null>
  getSessionState: (sessionId: string) => Promise<TuffIntelligenceStateSnapshot | null>
}
let TuffIntelligenceRuntimeCtor: new () => TuffIntelligenceRuntimeHarness

beforeAll(async () => {
  const runtimeModule = await import('./tuff-intelligence-runtime')
  TuffIntelligenceRuntimeCtor =
    runtimeModule.TuffIntelligenceRuntime as unknown as new () => TuffIntelligenceRuntimeHarness
})

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  for (const toolId of registeredToolIds) {
    toolRegistry.unregisterTool(toolId)
  }
  registeredToolIds.clear()
})

function registerRuntimeTool(toolId: string, executor: ToolExecutorFn): void {
  registeredToolIds.add(toolId)
  toolRegistry.registerTool(
    {
      id: toolId,
      name: toolId,
      description: 'Runtime security test tool.',
      inputSchema: { type: 'object', properties: {} }
    },
    executor
  )
}

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
    expect(
      events.every((event) => (event as { contractVersion?: number }).contractVersion === 3)
    ).toBe(true)
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

  it('reprojects persisted legacy trace payloads before replay', async () => {
    const runtime = new TuffIntelligenceRuntimeCtor() as TuffIntelligenceRuntimeHarness
    const stored = createStoredSession('session_legacy_trace')
    stored.session.lastEventSeq = 1
    stored.trace = [
      {
        id: 'trace_legacy_1',
        sessionId: 'session_legacy_trace',
        seq: 1,
        type: 'tool.completed',
        level: 'error',
        message: CANARY,
        payload: {
          callId: 'call.legacy.1',
          toolId: 'runtime.read.legacy',
          status: 'failed',
          errorCode: CANARY,
          input: { token: CANARY },
          output: { path: CANARY },
          error: CANARY
        },
        timestamp: 1
      }
    ]
    runtime.loadSession = vi.fn().mockResolvedValue(stored)

    const replay = await runtime.queryTrace({
      sessionId: 'session_legacy_trace',
      fromSeq: 1,
      limit: 10
    })

    expect(replay).toEqual([
      expect.objectContaining({
        message: 'Tool call completed',
        contractVersion: 3,
        payload: {
          callId: 'call.legacy.1',
          toolId: 'runtime.read.legacy',
          status: 'failed',
          errorCode: 'TOOL_EXECUTION_FAILED'
        }
      })
    ])
    expect(JSON.stringify(replay)).not.toContain(CANARY)
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

describe('TuffIntelligenceRuntime tool evidence boundary', () => {
  it('uses stable registry errors and allowlisted trace fields for hostile failures', async () => {
    const toolId = 'runtime.read.failure'
    const executor = vi.fn(async (_input: unknown, context: ToolExecutionContext) => {
      expect(context.errorProjection).toBe('stable')
      throw Object.assign(new Error(CANARY), { code: 'ENOENT' })
    })
    registerRuntimeTool(toolId, executor)
    const runtime = new TuffIntelligenceRuntimeCtor() as TuffIntelligenceRuntimeHarness
    const sessionId = 'session_tool_failure'
    await runtime.startSession({ sessionId })

    const result = await runtime.callTool({
      sessionId,
      toolId,
      input: { [CANARY]: CANARY, path: CANARY },
      callId: 'call.failure.1',
      metadata: {
        workingDirectory: CANARY,
        approvalContext: { reason: CANARY },
        contextSources: [{ path: CANARY }]
      }
    })
    const missing = await runtime.callTool({
      sessionId,
      toolId: CANARY,
      input: { value: CANARY },
      callId: 'call.missing.1'
    })

    expect(executor).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      success: false,
      error: 'TOOL_RESOURCE_NOT_FOUND: The requested resource was not found.',
      errorCode: 'TOOL_RESOURCE_NOT_FOUND'
    })
    expect(missing).toMatchObject({
      success: false,
      error: 'TOOL_NOT_FOUND: Tool is not available.',
      errorCode: 'TOOL_NOT_FOUND'
    })

    const trace = await runtime.queryTrace({ sessionId, limit: 100 })
    const serialized = JSON.stringify(trace)
    expect(serialized).not.toContain(CANARY)
    expect(serialized).not.toContain('approvalContext')
    expect(serialized).not.toContain('contextSources')
    expect(serialized).not.toContain('workingDirectory')
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool.called',
          message: 'Tool call started',
          payload: expect.objectContaining({
            callId: 'call.failure.1',
            toolId,
            status: 'started'
          })
        }),
        expect.objectContaining({
          type: 'tool.completed',
          message: 'Tool call completed',
          payload: expect.objectContaining({
            callId: 'call.failure.1',
            toolId,
            status: 'failed',
            errorCode: 'TOOL_RESOURCE_NOT_FOUND',
            durationMs: expect.any(Number)
          })
        }),
        expect.objectContaining({
          type: 'tool.completed',
          payload: expect.objectContaining({
            callId: 'call.missing.1',
            toolId: 'unknown',
            status: 'failed',
            errorCode: 'TOOL_NOT_FOUND'
          })
        })
      ])
    )
  })

  it('keeps safe success output for the caller but never copies it into trace evidence', async () => {
    const toolId = 'runtime.read.success'
    const output = { content: CANARY, nested: { path: CANARY } }
    const executor = vi.fn(async () => output)
    registerRuntimeTool(toolId, executor)
    const runtime = new TuffIntelligenceRuntimeCtor() as TuffIntelligenceRuntimeHarness
    const sessionId = 'session_tool_success'
    await runtime.startSession({ sessionId })

    const result = await runtime.callTool({
      sessionId,
      toolId,
      input: { token: CANARY },
      callId: 'call.success.1'
    })

    expect(result).toMatchObject({ success: true, output })
    expect(executor).toHaveBeenCalledTimes(1)
    const trace = await runtime.queryTrace({ sessionId, limit: 100 })
    expect(JSON.stringify(trace)).not.toContain(CANARY)
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool.completed',
          payload: expect.objectContaining({
            callId: 'call.success.1',
            toolId,
            status: 'succeeded'
          })
        })
      ])
    )
  })

  it('correlates approval and result without exposing the deferred input or decision reason', async () => {
    const toolId = 'runtime.write.approved'
    const executor = vi.fn(async () => ({ accepted: true }))
    registerRuntimeTool(toolId, executor)
    const runtime = new TuffIntelligenceRuntimeCtor() as TuffIntelligenceRuntimeHarness
    const sessionId = 'session_tool_approval'
    await runtime.startSession({ sessionId })

    const pending = await runtime.callTool({
      sessionId,
      toolId,
      input: { path: CANARY, token: CANARY },
      callId: 'call.approval.1',
      metadata: { approvalContext: CANARY, contextSources: [CANARY] }
    })
    expect(pending.approvalTicket).toMatchObject({
      toolId,
      riskLevel: 'high',
      status: 'pending'
    })
    expect(pending.approvalTicket?.metadata).toBeUndefined()
    const ticketId = pending.approvalTicket?.id
    expect(ticketId).toEqual(expect.any(String))

    const approved = await runtime.approveTool({
      ticketId: ticketId!,
      approved: true,
      approvedBy: CANARY,
      reason: CANARY
    })

    expect(approved).toMatchObject({
      id: ticketId,
      toolId,
      status: 'approved',
      resolvedBy: 'user'
    })
    expect(approved?.metadata).toBeUndefined()
    expect(executor).toHaveBeenCalledTimes(1)
    expect((await runtime.getSessionState(sessionId))?.pendingApprovals).toEqual([])

    const trace = await runtime.queryTrace({ sessionId, limit: 100 })
    const serialized = JSON.stringify({ approved, trace })
    expect(serialized).not.toContain(CANARY)
    expect(trace.filter((event) => event.type === 'tool.approval_required')).toHaveLength(1)
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool.approval_required',
          payload: expect.objectContaining({
            ticketId,
            callId: 'call.approval.1',
            toolId,
            status: 'pending'
          })
        }),
        expect.objectContaining({
          type: 'tool.approved',
          payload: { ticketId, toolId, decision: 'approved' }
        }),
        expect.objectContaining({
          type: 'tool.completed',
          payload: expect.objectContaining({
            callId: 'call.approval.1',
            toolId,
            status: 'succeeded'
          })
        })
      ])
    )
  })

  it('projects retry timeouts to one stable code', async () => {
    const toolId = 'runtime.read.timeout'
    const executor = vi.fn(() => new Promise<never>(() => undefined))
    registerRuntimeTool(toolId, executor)
    const runtime = new TuffIntelligenceRuntimeCtor() as TuffIntelligenceRuntimeHarness
    const sessionId = 'session_tool_timeout'
    await runtime.startSession({ sessionId })

    const result = await runtime.callTool({
      sessionId,
      toolId,
      input: { value: CANARY },
      callId: 'call.timeout.1',
      timeoutMs: 1
    })

    expect(executor).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      success: false,
      error: 'TOOL_EXECUTION_TIMEOUT: Tool execution timed out.',
      errorCode: 'TOOL_EXECUTION_TIMEOUT'
    })
    const trace = await runtime.queryTrace({ sessionId, limit: 100 })
    expect(JSON.stringify(trace)).not.toContain(CANARY)
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool.completed',
          payload: expect.objectContaining({
            callId: 'call.timeout.1',
            toolId,
            status: 'failed',
            errorCode: 'TOOL_EXECUTION_TIMEOUT'
          })
        })
      ])
    )
  })
})

describe('TuffIntelligenceRuntime capability caller binding', () => {
  it('binds execute metadata from a plugin caller while protecting session and turn identifiers', async () => {
    intelligenceSdkMocks.invoke.mockResolvedValue({
      result: { result: 'Plugin capability completed.' }
    })
    const runtime = new TuffIntelligenceRuntimeCtor() as TuffIntelligenceRuntimeHarness
    const sessionId = 'host-plugin-session'
    const objective = 'Run the plugin capability.'

    const plannedTurn = await runtime.plan({
      sessionId,
      objective,
      metadata: { caller: 'intelligence.planner' }
    })

    await expect(
      runtime.execute({
        sessionId,
        turnId: plannedTurn.id,
        metadata: {
          caller: 'plugin:third-party-plugin',
          traceId: 'plugin-capability-trace',
          operation: 'plugin-capability-action',
          sessionId: 'payload-session',
          turnId: 'payload-turn'
        }
      })
    ).resolves.toMatchObject({ status: 'completed' })

    expect(intelligenceSdkMocks.invoke).toHaveBeenCalledWith(
      'agent.run',
      { task: objective },
      {
        metadata: {
          caller: 'plugin:third-party-plugin',
          traceId: 'plugin-capability-trace',
          operation: 'plugin-capability-action',
          sessionId,
          turnId: plannedTurn.id
        }
      }
    )
  })
})

describe('TuffIntelligenceRuntime Pi execution plan', () => {
  it('plans and executes only the agent.run capability action', async () => {
    intelligenceSdkMocks.invoke.mockResolvedValue({
      result: { result: 'Release checks completed.' }
    })
    const runtime = new TuffIntelligenceRuntimeCtor() as TuffIntelligenceRuntimeHarness
    const objective = 'Verify release readiness.'
    const context = { workspace: '/workspace/release' }

    const plannedTurn = await runtime.plan({
      sessionId: 'session_pi_execution',
      objective,
      context
    })
    const snapshot = await runtime.getSessionState('session_pi_execution')
    const actions = snapshot?.actionGraph.nodes.filter((node) =>
      plannedTurn.actionIds.includes(node.id)
    )

    expect(actions).toHaveLength(1)
    expect(actions?.[0]).toMatchObject({
      type: 'capability',
      capabilityId: 'agent.run',
      input: { task: objective, context }
    })

    await expect(
      runtime.execute({
        sessionId: 'session_pi_execution',
        turnId: plannedTurn.id
      })
    ).resolves.toMatchObject({ status: 'completed' })
    expect(intelligenceSdkMocks.invoke).toHaveBeenCalledTimes(1)
    expect(intelligenceSdkMocks.invoke).toHaveBeenCalledWith(
      'agent.run',
      { task: objective, context },
      expect.objectContaining({
        metadata: expect.objectContaining({
          caller: 'intelligence.orchestrator',
          sessionId: 'session_pi_execution',
          turnId: plannedTurn.id
        })
      })
    )
  })
})
