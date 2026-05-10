import { describe, expect, it } from 'vitest'
import { evaluateClipboardStressSummary } from './clipboard-stress-verifier'
import type { ClipboardStressScenario, ClipboardStressSummary } from './clipboard-stress-verifier'

function scenario(overrides: Partial<ClipboardStressScenario> = {}): ClipboardStressScenario {
  return {
    intervalMs: 500,
    durationMs: 120_000,
    queueDepthPeak: {
      realtime: { queued: 1, inFlight: 1 },
      io: { queued: 1, inFlight: 1 },
      maintenance: { queued: 0, inFlight: 1 }
    },
    clipboard: {
      count: 240,
      schedulerDelaySampleCount: 240,
      avgSchedulerDelayMs: 12,
      p95SchedulerDelayMs: 45,
      lastSchedulerDelayMs: 10,
      maxSchedulerDelayMs: 90,
      lastDurationMs: 20,
      maxDurationMs: 120,
      droppedCount: 0,
      coalescedCount: 2,
      timeoutCount: 0,
      errorCount: 0
    },
    ...overrides
  }
}

function summary(results: ClipboardStressScenario[]): ClipboardStressSummary {
  return {
    schema: 'clipboard-stress-summary/v1',
    generatedAt: '2026-05-10T00:00:00.000Z',
    results
  }
}

describe('clipboard-stress-verifier', () => {
  it('passes when all stress scenarios stay within scheduler and queue budgets', () => {
    expect(
      evaluateClipboardStressSummary(summary([scenario(), scenario({ intervalMs: 250 })]), {
        minDurationMs: 120_000,
        requireIntervals: [500, 250],
        maxP95SchedulerDelayMs: 100,
        maxSchedulerDelayMs: 200,
        maxRealtimeQueuedPeak: 2,
        maxDroppedCount: 0
      })
    ).toEqual({
      passed: true,
      failures: []
    })
  })

  it('fails missing intervals and scheduler budget violations', () => {
    expect(
      evaluateClipboardStressSummary(
        summary([
          scenario({
            durationMs: 60_000,
            queueDepthPeak: { realtime: { queued: 4, inFlight: 1 } },
            clipboard: {
              ...scenario().clipboard,
              p95SchedulerDelayMs: 180,
              maxSchedulerDelayMs: 400,
              droppedCount: 2,
              timeoutCount: 1,
              errorCount: 1
            }
          })
        ]),
        {
          minDurationMs: 120_000,
          requireIntervals: [500, 250],
          maxP95SchedulerDelayMs: 100,
          maxSchedulerDelayMs: 200,
          maxRealtimeQueuedPeak: 2,
          maxDroppedCount: 0
        }
      )
    ).toEqual({
      passed: false,
      failures: [
        'missing required interval 250ms',
        'interval 500ms duration 60000 < 120000',
        'interval 500ms p95 scheduler delay 180 > 100',
        'interval 500ms max scheduler delay 400 > 200',
        'interval 500ms realtime queue peak 4 > 2',
        'interval 500ms dropped count 2 > 0',
        'interval 500ms timeout count 1 > 0',
        'interval 500ms error count 1 > 0'
      ]
    })
  })

  it('allows timeout and error counts only when explicitly configured', () => {
    expect(
      evaluateClipboardStressSummary(
        summary([
          scenario({
            clipboard: {
              ...scenario().clipboard,
              timeoutCount: 1,
              errorCount: 1
            }
          })
        ]),
        { allowTimeouts: true, allowErrors: true }
      )
    ).toEqual({
      passed: true,
      failures: []
    })
  })

  it('requires the clipboard stress schema when strict mode is enabled', () => {
    expect(
      evaluateClipboardStressSummary(
        {
          ...summary([scenario()]),
          schema: undefined
        },
        { strict: true }
      )
    ).toEqual({
      passed: false,
      failures: ['unsupported clipboard stress summary schema: undefined']
    })
  })
})
