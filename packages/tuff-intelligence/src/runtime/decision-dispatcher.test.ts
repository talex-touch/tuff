import type { AgentEnvelope } from '../protocol/envelope'
import type { TurnState } from '../protocol/session'
import { describe, expect, it } from 'vitest'
import { CapabilityRegistry } from '../registry/capability-registry'
import { DecisionDispatcher } from './decision-dispatcher'

function createState(): TurnState {
  return {
    sessionId: 'session-1',
    turnId: 'turn-1',
    done: false,
    seq: 0,
    messages: [],
    events: [],
  }
}

describe('decisionDispatcher approval events', () => {
  it('emits approval request envelopes', async () => {
    const dispatcher = new DecisionDispatcher({
      capabilityRegistry: new CapabilityRegistry(),
    })

    const events: AgentEnvelope[] = []
    for await (const event of dispatcher.dispatch({
      done: false,
      approvalRequests: [
        {
          id: 'approval-1',
          actionId: 'file.delete',
          riskLevel: 'high',
          reason: 'Dangerous operation.',
        },
      ],
    }, createState())) {
      events.push(event)
    }

    expect(events).toEqual([
      expect.objectContaining({
        correlationId: 'approval-1',
        source: 'runtime',
        type: 'approval.request',
        payload: expect.objectContaining({
          actionId: 'file.delete',
          riskLevel: 'high',
        }),
      }),
    ])
  })
})

describe('decisionDispatcher orchestration events', () => {
  it('emits skill request envelopes', async () => {
    const dispatcher = new DecisionDispatcher({
      capabilityRegistry: new CapabilityRegistry(),
    })

    const skillRequest = {
      id: 'skill-1',
      skillId: 'code-review',
      reason: 'Inspect the generated patch.',
    }
    const events: AgentEnvelope[] = []
    for await (const event of dispatcher.dispatch({
      done: false,
      skillRequests: [skillRequest],
    }, createState())) {
      events.push(event)
    }

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual(expect.objectContaining({
      correlationId: 'skill-1',
      source: 'runtime',
      type: 'skill.request',
    }))
    expect(events[0]?.payload).toBe(skillRequest)
  })

  it('emits sub-agent task envelopes', async () => {
    const dispatcher = new DecisionDispatcher({
      capabilityRegistry: new CapabilityRegistry(),
    })

    const subAgentTask = {
      id: 'task-1',
      objective: 'Verify search cleanup behavior.',
      input: {
        package: '@talex-touch/core-app',
      },
    }
    const events: AgentEnvelope[] = []
    for await (const event of dispatcher.dispatch({
      done: false,
      subAgentTasks: [subAgentTask],
    }, createState())) {
      events.push(event)
    }

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual(expect.objectContaining({
      correlationId: 'task-1',
      source: 'runtime',
      type: 'subagent.task',
    }))
    expect(events[0]?.payload).toBe(subAgentTask)
  })
})
