import type { AgentEnvelope } from '@talex-touch/tuff-intelligence/pilot'
import { runPilotConversationStream } from '@talex-touch/tuff-intelligence/pilot'
import { describe, expect, it } from 'vitest'

describe('pilot stream replay', () => {
  it('fromSeq 补播时只透传缺失 trace 事件，并保留原 seq', async () => {
    const events: Array<Record<string, unknown>> = []

    await runPilotConversationStream({
      runtime: {
        async *onMessage(): AsyncIterable<AgentEnvelope> {},
      } as any,
      sessionId: 'session-replay',
      fromSeq: 5,
      listTrace: async (_sessionId, fromSeq) => {
        expect(fromSeq).toBe(5)
        return [
          {
            id: 'trace_4',
            sessionId: 'session-replay',
            seq: 4,
            type: 'done',
            payload: {
              status: 'ok',
            },
            createdAt: '2026-04-03T00:00:04.000Z',
          },
          {
            id: 'trace_5',
            sessionId: 'session-replay',
            seq: 5,
            type: 'assistant.delta',
            payload: {
              text: 'Hello ',
            },
            createdAt: '2026-04-03T00:00:05.000Z',
          },
          {
            id: 'trace_6',
            sessionId: 'session-replay',
            seq: 6,
            type: 'assistant.final',
            payload: {
              text: 'Hello world',
            },
            createdAt: '2026-04-03T00:00:06.000Z',
          },
          {
            id: 'trace_7',
            sessionId: 'session-replay',
            seq: 7,
            type: 'error',
            payload: {
              message: 'legacy error',
            },
            createdAt: '2026-04-03T00:00:07.000Z',
          },
        ]
      },
      emit: async (payload) => {
        events.push({
          type: payload.type,
          seq: payload.seq,
          replay: payload.replay,
          delta: payload.delta,
          message: payload.message,
        })
      },
    })

    expect(events).toEqual([
      {
        type: 'stream.started',
        seq: undefined,
        replay: undefined,
        delta: undefined,
        message: undefined,
      },
      {
        type: 'replay.started',
        seq: undefined,
        replay: undefined,
        delta: undefined,
        message: undefined,
      },
      {
        type: 'assistant.delta',
        seq: 5,
        replay: true,
        delta: 'Hello ',
        message: undefined,
      },
      {
        type: 'assistant.final',
        seq: 6,
        replay: true,
        delta: undefined,
        message: 'Hello world',
      },
      {
        type: 'replay.finished',
        seq: undefined,
        replay: undefined,
        delta: undefined,
        message: undefined,
      },
    ])
  })
})
