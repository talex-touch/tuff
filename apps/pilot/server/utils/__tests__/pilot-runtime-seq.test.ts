import type { AgentEnvelope, AgentEventType, RuntimeStoreAdapter, SessionRecord, TraceRecord } from '@talex-touch/tuff-intelligence/pilot'
import type { UserMessageInput } from '@talex-touch/tuff-intelligence/pilot'
import { AbstractAgentRuntime } from '@talex-touch/tuff-intelligence/pilot'
import { describe, expect, it } from 'vitest'

class TestPilotRuntime extends AbstractAgentRuntime {}

function createEnvelope(type: AgentEventType, text: string): AgentEnvelope {
  return {
    version: 'aep/1',
    id: `evt_${type}_${text}`,
    sessionId: 'session_seq',
    turnId: 'turn_seq',
    source: 'assistant',
    type,
    ts: '2026-04-03T00:00:00.000Z',
    payload: {
      text,
    },
  }
}

function createRuntimeStoreHarness() {
  const session: SessionRecord = {
    sessionId: 'session_seq',
    userId: 'user_seq',
    status: 'idle',
    messages: [],
    lastTurnId: undefined,
    lastSeq: 0,
    createdAt: '2026-04-03T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:00.000Z',
  }
  const messages: Array<{
    role: string
    content: string
  }> = []
  const traces: TraceRecord[] = []

  const runtime: RuntimeStoreAdapter = {
    async ensureSchema() {},
    async createSession(input: UserMessageInput) {
      if (input.sessionId) {
        session.sessionId = input.sessionId
      }
      return session
    },
    async getSession(sessionId: string) {
      return session.sessionId === sessionId ? session : null
    },
    async listSessions() {
      return [session]
    },
    async saveMessage(record) {
      messages.push({
        role: record.role,
        content: record.content,
      })
    },
    async listMessages() {
      return []
    },
    async appendTrace(record) {
      const trace: TraceRecord = {
        id: `trace_${record.seq}`,
        sessionId: record.sessionId,
        seq: record.seq,
        type: record.type,
        payload: record.payload,
        createdAt: `2026-04-03T00:00:0${record.seq}.000Z`,
      }
      traces.push(trace)
      session.lastSeq = record.seq
      session.updatedAt = trace.createdAt
      return trace
    },
    async listTrace() {
      return traces
    },
    async saveCheckpoint() {},
    async loadCheckpoint() {
      return null
    },
    async touchHeartbeat() {},
    async pauseSession() {},
    async completeSession(_sessionId, status) {
      session.status = status
    },
    async setSessionTitle() {},
    async setSessionNotification() {},
    async listSessionNotifications() {
      return []
    },
    async clearSessionMemory() {},
    async deleteSession() {},
    async saveAttachment() {},
    async listAttachments() {
      return []
    },
  }

  return {
    runtime,
    messages,
    traces,
  }
}

describe('pilot runtime single seq stream', () => {
  it('会先持久化再发射合并后的 assistant.delta，并保证 seq 与 trace 一一对应', async () => {
    const emitted: AgentEnvelope[] = []
    const harness = createRuntimeStoreHarness()
    const runtime = new TestPilotRuntime({
      engine: {
        id: 'engine_seq',
        async run() {
          throw new Error('unexpected single run call')
        },
        async *runStream() {
          yield {
            done: false,
            events: [createEnvelope('assistant.delta', 'Hel')],
          }
          yield {
            done: false,
            events: [createEnvelope('assistant.delta', 'lo')],
          }
          yield {
            done: true,
            events: [createEnvelope('assistant.final', 'Hello')],
          }
        },
      },
      decision: {
        id: 'decision_seq',
        async normalize(raw) {
          return raw as any
        },
      },
      dispatcher: {
        async *dispatch(decision) {
          for (const event of (decision as any).events || []) {
            yield event
          }
        },
      } as any,
      store: {
        runtime: harness.runtime,
        emit: async (event) => {
          emitted.push(event)
        },
      },
    } as any)

    const outputs: AgentEnvelope[] = []
    for await (const envelope of runtime.onMessage({
      sessionId: 'session_seq',
      message: 'hi',
    })) {
      outputs.push(envelope)
    }

    expect(outputs).toHaveLength(2)
    expect(outputs.map(item => ({
      type: item.type,
      seq: item.meta?.seq,
      traceId: item.meta?.traceId,
      text: (item.payload as Record<string, unknown>).text,
    }))).toEqual([
      {
        type: 'assistant.delta',
        seq: 1,
        traceId: 'trace_1',
        text: 'Hello',
      },
      {
        type: 'assistant.final',
        seq: 2,
        traceId: 'trace_2',
        text: 'Hello',
      },
    ])
    expect(harness.traces.map(item => ({
      seq: item.seq,
      type: item.type,
      text: item.payload.text,
    }))).toEqual([
      {
        seq: 1,
        type: 'assistant.delta',
        text: 'Hello',
      },
      {
        seq: 2,
        type: 'assistant.final',
        text: 'Hello',
      },
    ])
    expect(emitted.map(item => item.meta?.seq)).toEqual([1, 2])
    expect(harness.messages).toEqual([
      {
        role: 'user',
        content: 'hi',
      },
      {
        role: 'assistant',
        content: 'Hello',
      },
    ])
  })
})
