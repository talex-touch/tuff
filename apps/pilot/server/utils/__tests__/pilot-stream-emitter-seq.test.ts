import { createPilotStreamEmitter } from '@talex-touch/tuff-intelligence/pilot'
import { describe, expect, it, vi } from 'vitest'

describe('pilot-stream-emitter seq contract', () => {
  it('对可恢复事件要求 seq，未持久化时直接报错', async () => {
    const appendTrace = vi.fn()
    const send = vi.fn()
    const emitter = createPilotStreamEmitter({
      sessionId: 'session-emitter',
      getLastSeq: async () => 0,
      appendTrace,
      send,
    })

    await expect(emitter.emit({
      type: 'assistant.final',
      message: 'hello',
      payload: {
        text: 'hello',
      },
    })).rejects.toThrow('missing seq')
    expect(appendTrace).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('持久化事件会先补 seq 再发送', async () => {
    const appendTrace = vi.fn(async () => {})
    const send = vi.fn()
    const emitter = createPilotStreamEmitter({
      sessionId: 'session-emitter',
      getLastSeq: async () => 0,
      appendTrace,
      send,
      now: () => 1_234,
    })

    await emitter.emit({
      type: 'assistant.final',
      message: 'hello',
      payload: {
        text: 'hello',
      },
    }, {
      persist: true,
      tracePayload: {
        text: 'hello',
      },
    })

    expect(appendTrace).toHaveBeenCalledWith({
      sessionId: 'session-emitter',
      seq: 1,
      type: 'assistant.final',
      payload: {
        text: 'hello',
      },
    })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'assistant.final',
      seq: 1,
      message: 'hello',
      timestamp: 1_234,
    }))
  })

  it('stream.heartbeat 允许无 seq', async () => {
    const send = vi.fn()
    const emitter = createPilotStreamEmitter({
      sessionId: 'session-emitter',
      getLastSeq: async () => 0,
      appendTrace: async () => {},
      send,
      now: () => 5_678,
    })

    await emitter.emit({
      type: 'stream.heartbeat',
      payload: {
        ts: 5_678,
      },
    })

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stream.heartbeat',
      seq: undefined,
      timestamp: 5_678,
    }))
  })
})
