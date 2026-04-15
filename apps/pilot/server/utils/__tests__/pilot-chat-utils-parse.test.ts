import { describe, expect, it } from 'vitest'
import { parseSseChunks } from '../../../app/composables/pilot-chat.utils'

describe('pilot-chat utils parseSseChunks', () => {
  it('会保留 replay assistant.delta 的 delta 与 seq', () => {
    const events = parseSseChunks([
      'event: message',
      'data: {"type":"assistant.delta","seq":12,"delta":"Hello ","replay":true,"payload":{"text":"Hello "}}',
      '',
    ].join('\n'))

    expect(events).toEqual([
      {
        type: 'assistant.delta',
        event: 'message',
        phase: undefined,
        sessionId: undefined,
        session_id: undefined,
        turnId: undefined,
        turn_id: undefined,
        request_id: undefined,
        queue_pos: undefined,
        seq: 12,
        delta: 'Hello ',
        message: undefined,
        name: undefined,
        data: undefined,
        code: undefined,
        status_code: undefined,
        status: undefined,
        reason: undefined,
        detail: undefined,
        payload: {
          text: 'Hello ',
        },
        replay: true,
        timestamp: undefined,
      },
    ])
  })

  it('会保留 replay assistant.final 的 message 与 seq', () => {
    const events = parseSseChunks([
      'event: message',
      'data: {"type":"assistant.final","seq":"13","message":"Hello world","replay":true,"payload":{"text":"Hello world"}}',
      '',
    ].join('\n'))

    expect(events).toEqual([
      {
        type: 'assistant.final',
        event: 'message',
        phase: undefined,
        sessionId: undefined,
        session_id: undefined,
        turnId: undefined,
        turn_id: undefined,
        request_id: undefined,
        queue_pos: undefined,
        seq: 13,
        delta: undefined,
        message: 'Hello world',
        name: undefined,
        data: undefined,
        code: undefined,
        status_code: undefined,
        status: undefined,
        reason: undefined,
        detail: undefined,
        payload: {
          text: 'Hello world',
        },
        replay: true,
        timestamp: undefined,
      },
    ])
  })

  it('DONE 帧会归一化为 done 事件', () => {
    expect(parseSseChunks('data: [DONE]\n')).toEqual([
      {
        type: 'done',
      },
    ])
  })
})
