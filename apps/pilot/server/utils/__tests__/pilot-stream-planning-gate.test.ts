import type { AgentEnvelope } from '@talex-touch/tuff-intelligence/pilot-server'
import { runPilotConversationStream } from '@talex-touch/tuff-intelligence/pilot'
import { describe, expect, it } from 'vitest'

function createAssistantFinalEnvelope(): AgentEnvelope {
  return {
    type: 'assistant.final',
    sessionId: 'session-planning-gate',
    turnId: 'turn-planning-gate',
    payload: {
      text: 'done',
    },
    meta: {
      seq: 9,
      traceId: 'trace_9',
    },
  } as AgentEnvelope
}

async function collectEventTypes(shouldUseTools: boolean): Promise<string[]> {
  const eventTypes: string[] = []

  await runPilotConversationStream({
    runtime: {
      async *onMessage() {
        yield createAssistantFinalEnvelope()
      },
    } as any,
    sessionId: 'session-planning-gate',
    message: '请帮我总结一下今天的进展',
    metadata: {
      toolDecision: {
        shouldUseTools,
      },
    },
    emit: async (payload) => {
      eventTypes.push(payload.type)
    },
  })

  return eventTypes
}

describe('pilot stream planning gate', () => {
  it('toolDecision.shouldUseTools=false 时不发 synthetic planning 事件', async () => {
    const eventTypes = await collectEventTypes(false)

    expect(eventTypes).not.toContain('planning.started')
    expect(eventTypes).not.toContain('planning.updated')
    expect(eventTypes).not.toContain('planning.finished')
    expect(eventTypes).toContain('turn.started')
    expect(eventTypes).toContain('assistant.final')
  })

  it('toolDecision.shouldUseTools=true 时也不再注入 synthetic planning 事件', async () => {
    const eventTypes = await collectEventTypes(true)

    expect(eventTypes).not.toContain('planning.started')
    expect(eventTypes).not.toContain('planning.updated')
    expect(eventTypes).not.toContain('planning.finished')
    expect(eventTypes).toContain('turn.started')
    expect(eventTypes).toContain('assistant.final')
  })
})
