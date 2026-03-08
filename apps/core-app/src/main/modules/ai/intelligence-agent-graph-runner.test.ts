import { describe, expect, it, vi } from 'vitest'
import type {
  TuffIntelligenceAgentSession,
  TuffIntelligenceStateSnapshot,
  TuffIntelligenceTurn
} from '@talex-touch/tuff-intelligence'
import type { CoreAgentGraphRuntime } from './intelligence-agent-graph-runner'
import { runCoreIntelligenceAgentGraph } from './intelligence-agent-graph-runner'

function createSession(
  status: TuffIntelligenceAgentSession['status'] = 'idle'
): TuffIntelligenceAgentSession {
  return {
    id: 'session_1',
    status,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

function createTurn(status: TuffIntelligenceTurn['status']): TuffIntelligenceTurn {
  return {
    id: 'turn_1',
    sessionId: 'session_1',
    status,
    actionIds: [],
    startedAt: Date.now()
  }
}

function createSnapshot(
  status: TuffIntelligenceStateSnapshot['status']
): TuffIntelligenceStateSnapshot {
  return {
    sessionId: 'session_1',
    status,
    actionGraph: {
      sessionId: 'session_1',
      nodes: [],
      edges: [],
      version: 1,
      updatedAt: Date.now()
    },
    pendingApprovals: [],
    updatedAt: Date.now()
  }
}

describe('runCoreIntelligenceAgentGraph', () => {
  it('按 session.start -> plan -> execute -> reflect -> finalize 顺序执行', async () => {
    const callOrder: string[] = []

    const runtime: CoreAgentGraphRuntime = {
      startSession: vi.fn(async () => {
        callOrder.push('session.start')
        return createSession('idle')
      }),
      plan: vi.fn(async () => {
        callOrder.push('plan')
        return createTurn('planned')
      }),
      execute: vi.fn(async () => {
        callOrder.push('execute')
        return createTurn('completed')
      }),
      reflect: vi.fn(async () => {
        callOrder.push('reflect')
        return createTurn('completed')
      }),
      getSessionState: vi.fn(async () => {
        callOrder.push('finalize')
        return createSnapshot('completed')
      })
    }

    const snapshot = await runCoreIntelligenceAgentGraph(runtime, {
      objective: 'test objective'
    })

    expect(snapshot?.status).toBe('completed')
    expect(callOrder).toEqual(['session.start', 'plan', 'execute', 'reflect', 'finalize'])
  })

  it('waiting_approval 时跳过 reflect 节点', async () => {
    const runtime: CoreAgentGraphRuntime = {
      startSession: vi.fn(async () => createSession('idle')),
      plan: vi.fn(async () => createTurn('planned')),
      execute: vi.fn(async () => createTurn('waiting_approval')),
      reflect: vi.fn(async () => createTurn('completed')),
      getSessionState: vi.fn(async () => createSnapshot('waiting_approval'))
    }

    const snapshot = await runCoreIntelligenceAgentGraph(runtime, {
      objective: 'test objective'
    })

    expect(snapshot?.status).toBe('waiting_approval')
    expect(runtime.reflect).not.toHaveBeenCalled()
  })
})
