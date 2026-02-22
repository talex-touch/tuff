import { describe, expect, it } from 'vitest'
import { digestRiskPayload, shouldRequireDualControl } from '../adminRiskActions'

describe('adminRiskActions', () => {
  it('同 payload 生成相同 digest', () => {
    const payload = {
      actors: ['1.1.1.1', '2.2.2.2'],
      reason: 'test',
    }
    const d1 = digestRiskPayload(payload)
    const d2 = digestRiskPayload({
      reason: 'test',
      actors: ['1.1.1.1', '2.2.2.2'],
    })
    expect(d1).toBe(d2)
  })

  it('mode -> NORMAL 需要双人复核', () => {
    expect(shouldRequireDualControl('risk.mode.override', { mode: 'NORMAL' })).toBe(true)
    expect(shouldRequireDualControl('risk.mode.override', { mode: 'EXTREME' })).toBe(false)
  })

  it('批量解封超过 50 需要双人复核', () => {
    const actors = Array.from({ length: 51 }).map((_, index) => `10.0.0.${index}`)
    expect(shouldRequireDualControl('risk.actor.unblock', { actors })).toBe(true)
    expect(shouldRequireDualControl('risk.actor.unblock', { actors: actors.slice(0, 2) })).toBe(false)
  })

  it('永久封禁候选 approve 需要双人复核', () => {
    expect(shouldRequireDualControl('risk.case.review', {
      kind: 'ip-ban-upsert',
      enabled: true,
      permanent: true,
    })).toBe(true)

    expect(shouldRequireDualControl('risk.case.review', {
      kind: 'ip-ban-upsert',
      enabled: true,
      permanent: false,
    })).toBe(false)
  })
})

