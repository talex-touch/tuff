import { describe, expect, it } from 'vitest'
import { resolvePilotTraceTailWindow } from '../pilot-trace-window'

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
})
