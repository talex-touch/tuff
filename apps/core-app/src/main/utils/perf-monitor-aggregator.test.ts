import { describe, expect, it } from 'vitest'
import {
  buildTopEvents,
  buildTopPhaseCodes,
  pickTopSlowIncidents,
  summarizeIncidentKinds,
  type PerfIncidentLike
} from './perf-monitor-aggregator'

describe('perf-monitor-aggregator', () => {
  it('按 kind 汇总并排序', () => {
    const snapshot: PerfIncidentLike[] = [
      { kind: 'event_loop.lag', severity: 'warn' },
      { kind: 'event_loop.lag', severity: 'error' },
      { kind: 'ipc.no_handler', severity: 'warn' }
    ]

    expect(summarizeIncidentKinds(snapshot)).toBe('event_loop.lag=2 ipc.no_handler=1')
  })

  it('选取 top slow 事件', () => {
    const snapshot: PerfIncidentLike[] = [
      { kind: 'a', severity: 'warn', durationMs: 80 },
      { kind: 'b', severity: 'warn', durationMs: 120 },
      { kind: 'c', severity: 'warn', durationMs: 40 }
    ]

    const top = pickTopSlowIncidents(snapshot, 2)
    expect(top.map((item) => item.kind)).toEqual(['b', 'a'])
  })

  it('构建 top events key（包含 direction/channelType）', () => {
    const snapshot: PerfIncidentLike[] = [
      {
        kind: 'ipc.no_handler',
        severity: 'warn',
        eventName: 'clipboard:get-history',
        direction: 'renderer->main',
        meta: { channelType: 'plugin' }
      },
      {
        kind: 'ipc.no_handler',
        severity: 'warn',
        eventName: 'clipboard:get-history',
        direction: 'renderer->main',
        meta: { channelType: 'plugin' }
      }
    ]

    const topEvents = buildTopEvents(snapshot)
    expect(topEvents[0]).toEqual({
      key: 'ipc.no_handler:renderer->main:plugin:clipboard:get-history',
      count: 2
    })
  })

  it('构建 top phase codes（meta 优先，支持 main.clipboard 派生）', () => {
    const snapshot: PerfIncidentLike[] = [
      {
        kind: 'main.clipboard.check.slow',
        severity: 'warn',
        eventName: 'image_pipeline',
        durationMs: 640
      },
      {
        kind: 'main.clipboard.cache.hydrate.slow',
        severity: 'warn',
        eventName: 'gate_wait',
        durationMs: 1510
      },
      {
        kind: 'main.clipboard.check.slow',
        severity: 'warn',
        eventName: 'ignored',
        durationMs: 500,
        meta: { phaseAlertCode: 'image_pipeline' }
      }
    ]

    const topCodes = buildTopPhaseCodes(snapshot)
    expect(topCodes[0]).toEqual({
      code: 'image_pipeline',
      count: 2,
      maxDurationMs: 640
    })
    expect(topCodes.some((item) => item.code === 'gate_wait')).toBe(true)
  })
})
