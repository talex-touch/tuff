import { describe, expect, it } from 'vitest'
import {
  evaluateSearchTracePerformance,
  parseSearchTraceLine,
  parseSearchTracePayload,
  summarizeSearchTracePerformance
} from './search-trace-stats'

function traceLine(event: 'first.result' | 'session.end', sessionId: string, totalMs: number) {
  return `[search-trace/v1] ${JSON.stringify({
    schema: 'search-trace/v1',
    event,
    sessionId,
    timing: { totalMs },
    ts: 1_700_000_000_000,
    query: { len: 6, hash: 'redacted' }
  })}`
}

function traceLineWithProviders(
  event: 'first.result' | 'session.end',
  sessionId: string,
  totalMs: number,
  topSlow: Array<{ providerId: string; durationMs: number; status: string; resultCount: number }>
) {
  return `[search-trace/v1] ${JSON.stringify({
    schema: 'search-trace/v1',
    event,
    sessionId,
    timing: { totalMs },
    ts: 1_700_000_000_000,
    query: { len: 6, hash: 'redacted' },
    providers: {
      summary: {
        total: topSlow.length,
        byStatus: {},
        topSlow
      }
    }
  })}`
}

describe('search-trace-stats', () => {
  it('parses search trace lines without depending on query plaintext', () => {
    expect(parseSearchTraceLine(traceLine('first.result', 's1', 42))).toEqual({
      event: 'first.result',
      sessionId: 's1',
      totalMs: 42,
      ts: 1_700_000_000_000,
      providerSlow: []
    })
    expect(parseSearchTraceLine('no trace here')).toBeNull()
    expect(
      parseSearchTracePayload({
        schema: 'search-trace/v1',
        event: 'session.start',
        sessionId: 'ignored',
        timing: { totalMs: 1 }
      })
    ).toBeNull()
  })

  it('summarizes first result and session end p95 with slow query ratio', () => {
    const lines = [
      traceLine('first.result', 's1', 30),
      traceLine('session.end', 's1', 70),
      traceLine('first.result', 's2', 80),
      traceLine('session.end', 's2', 900),
      traceLine('first.result', 's3', 50)
    ]

    const summary = summarizeSearchTracePerformance(lines, {
      minSamples: 2,
      slowThresholdMs: 800
    })

    expect(summary).toMatchObject({
      schema: 'search-trace-stats/v1',
      minSamples: 2,
      slowThresholdMs: 800,
      enoughSamples: true,
      sessionCount: 3,
      pairedSessionCount: 2,
      missingSessionEndSessionCount: 1,
      firstResult: {
        sampleCount: 3,
        avgMs: 53,
        p50Ms: 50,
        p95Ms: 80,
        slowCount: 0,
        slowRatio: 0
      },
      sessionEnd: {
        sampleCount: 2,
        avgMs: 485,
        p50Ms: 70,
        p95Ms: 900,
        slowCount: 1,
        slowRatio: 0.5
      }
    })
    expect(summary.providerSlow).toEqual([])
  })

  it('aggregates provider slow samples from detailed session traces', () => {
    const summary = summarizeSearchTracePerformance(
      [
        traceLineWithProviders('session.end', 's1', 900, [
          { providerId: 'everything-provider', durationMs: 820, status: 'success', resultCount: 5 },
          { providerId: 'plugin-features', durationMs: 120, status: 'success', resultCount: 2 }
        ]),
        traceLineWithProviders('session.end', 's2', 950, [
          { providerId: 'everything-provider', durationMs: 900, status: 'timeout', resultCount: 0 },
          { providerId: 'app-provider', durationMs: 200, status: 'success', resultCount: 8 }
        ]),
        traceLineWithProviders('session.end', 's3', 700, [
          { providerId: 'plugin-features', durationMs: 480, status: 'error', resultCount: 0 }
        ])
      ],
      { minSamples: 1, slowThresholdMs: 800 }
    )

    expect(summary.providerSlow).toEqual([
      {
        providerId: 'everything-provider',
        sampleCount: 2,
        avgMs: 860,
        p95Ms: 900,
        maxMs: 900,
        timeoutCount: 1,
        errorCount: 0,
        resultCount: 5
      },
      {
        providerId: 'plugin-features',
        sampleCount: 2,
        avgMs: 300,
        p95Ms: 480,
        maxMs: 480,
        timeoutCount: 0,
        errorCount: 1,
        resultCount: 2
      },
      {
        providerId: 'app-provider',
        sampleCount: 1,
        avgMs: 200,
        p95Ms: 200,
        maxMs: 200,
        timeoutCount: 0,
        errorCount: 0,
        resultCount: 8
      }
    ])
  })

  it('evaluates strict sample and threshold gates', () => {
    const summary = summarizeSearchTracePerformance(
      [
        traceLine('first.result', 's1', 30),
        traceLine('session.end', 's1', 70),
        traceLine('first.result', 's2', 900),
        traceLine('session.end', 's2', 950)
      ],
      {
        minSamples: 3,
        slowThresholdMs: 800
      }
    )

    expect(
      evaluateSearchTracePerformance(summary, {
        strict: true,
        maxFirstResultP95Ms: 800,
        maxSessionEndP95Ms: 900,
        maxSlowRatio: 0.4
      })
    ).toEqual({
      passed: false,
      failures: [
        'paired sessions 2 < minSamples 3',
        'first.result p95 900 > 800',
        'session.end p95 950 > 900',
        'first.result slowRatio 0.5 > 0.4',
        'session.end slowRatio 0.5 > 0.4'
      ]
    })
  })

  it('allows verifier gates to override the archived minimum sample count', () => {
    const summary = summarizeSearchTracePerformance(
      [
        traceLine('first.result', 's1', 30),
        traceLine('session.end', 's1', 70),
        traceLine('first.result', 's2', 80),
        traceLine('session.end', 's2', 100)
      ],
      {
        minSamples: 1,
        slowThresholdMs: 800
      }
    )

    expect(
      evaluateSearchTracePerformance(summary, {
        strict: true,
        minSamples: 3
      })
    ).toEqual({
      passed: false,
      failures: ['paired sessions 2 < minSamples 3']
    })
  })

  it('rejects internally inconsistent archived performance summaries', () => {
    const summary = summarizeSearchTracePerformance(
      [traceLine('first.result', 's1', 30), traceLine('session.end', 's1', 70)],
      {
        minSamples: 200,
        slowThresholdMs: 800
      }
    )

    expect(
      evaluateSearchTracePerformance(
        {
          ...summary,
          enoughSamples: true,
          sessionCount: 1,
          pairedSessionCount: 200,
          firstResult: {
            ...summary.firstResult,
            sampleCount: 1,
            slowCount: 2
          },
          sessionEnd: {
            ...summary.sessionEnd,
            sampleCount: 1
          }
        },
        {
          strict: true,
          minSamples: 200
        }
      )
    ).toEqual({
      passed: false,
      failures: [
        'search trace paired sessions exceed session count',
        'search trace paired sessions exceed first.result samples',
        'search trace paired sessions exceed session.end samples',
        'search trace session count 1 does not match paired/missing sessions 200',
        'search trace first.result slow count exceeds samples',
        'search trace first.result slowRatio does not match slow count'
      ]
    })
  })

  it('rejects internally inconsistent archived metric ratios and percentiles', () => {
    const summary = summarizeSearchTracePerformance(
      [
        traceLine('first.result', 's1', 30),
        traceLine('session.end', 's1', 70),
        traceLine('first.result', 's2', 900),
        traceLine('session.end', 's2', 950)
      ],
      {
        minSamples: 1,
        slowThresholdMs: 800
      }
    )

    expect(
      evaluateSearchTracePerformance(
        {
          ...summary,
          firstResult: {
            ...summary.firstResult,
            slowRatio: 0,
            p50Ms: 900,
            p95Ms: 30
          },
          sessionEnd: {
            ...summary.sessionEnd,
            slowRatio: 1,
            p95Ms: 950,
            p99Ms: 70
          }
        },
        {
          strict: true
        }
      )
    ).toEqual({
      passed: false,
      failures: [
        'search trace first.result slowRatio does not match slow count',
        'search trace first.result p95 is less than p50',
        'search trace session.end slowRatio does not match slow count',
        'search trace session.end p99 is less than p95'
      ]
    })
  })
})
