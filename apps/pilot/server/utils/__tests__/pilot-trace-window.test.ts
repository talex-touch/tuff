import { describe, expect, it, vi } from 'vitest'
import { listPilotTraceTail, resolvePilotTraceTailWindow } from '../pilot-trace-window'

describe('pilot-trace-window', () => {
  it('lastSeq 未超过 limit 时从 1 开始读取', () => {
    expect(resolvePilotTraceTailWindow(120, 2_000)).toEqual({
      fromSeq: 1,
      limit: 2_000,
    })
  })

  it('lastSeq 超过 limit 时仅读取最新窗口', () => {
    expect(resolvePilotTraceTailWindow(2_505, 2_000)).toEqual({
      fromSeq: 506,
      limit: 2_000,
    })
  })

  it('最新窗口缺少 turn.started 时会继续向前补批，直到覆盖当前 turn 起点', async () => {
    const listTrace = vi.fn()
      .mockResolvedValueOnce([
        { seq: 2_501, type: 'thinking.delta' },
        { seq: 2_502, type: 'run.audit' },
        { seq: 2_503, type: 'assistant.final' },
      ])
      .mockResolvedValueOnce([
        { seq: 501, type: 'turn.started' },
        { seq: 502, type: 'intent.started' },
        { seq: 503, type: 'intent.completed' },
      ])

    const traces = await listPilotTraceTail({
      listTrace,
    }, {
      sessionId: 'session-long-turn',
      lastSeq: 2_503,
      limit: 2_000,
    })

    expect(listTrace).toHaveBeenNthCalledWith(1, 'session-long-turn', 504, 2_000)
    expect(listTrace).toHaveBeenNthCalledWith(2, 'session-long-turn', 1, 503)
    expect(traces.map(item => item.type)).toEqual([
      'turn.started',
      'intent.started',
      'intent.completed',
      'thinking.delta',
      'run.audit',
      'assistant.final',
    ])
  })

  it('补批达到上限时停止回溯，避免无限扩大窗口', async () => {
    const listTrace = vi.fn()
      .mockResolvedValueOnce([{ seq: 4_001, type: 'thinking.delta' }])
      .mockResolvedValueOnce([{ seq: 2_001, type: 'run.audit' }])

    const traces = await listPilotTraceTail({
      listTrace,
    }, {
      sessionId: 'session-capped',
      lastSeq: 4_001,
      limit: 2_000,
      maxBatches: 2,
    })

    expect(listTrace).toHaveBeenCalledTimes(2)
    expect(traces.map(item => item.type)).toEqual([
      'run.audit',
      'thinking.delta',
    ])
  })
})
