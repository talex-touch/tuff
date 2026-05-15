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
