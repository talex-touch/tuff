// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  EverythingDiagnosticStage,
  EverythingDiagnosticStatus,
  EverythingStatusResponse
} from '../src/shared/events/everything'
import type { EverythingCoreBoxSearchModeId } from '../src/main/modules/platform/everything-corebox-ui-verifier'
import {
  buildDomSummaryExpression,
  checkEverythingModeBackendUsage
} from './coreapp-packaged-corebox-everything-probe'

/**
 * The packaged probe reads rendered CoreBox rows to decide whether a mode actually produced file
 * results. A degraded/unavailable notice is rendered as a `.BoxItem--notice` row
 * (`kind: 'notification'`), which is not a file result. If the probe counted it:
 *
 * - a backend-down run would report phantom result rows and could satisfy the Windows gate, and
 * - the marker-match count would credit a notice's text as an index hit.
 *
 * The DOM summary expression is the only place that exclusion is decided, so these cases pin it
 * against a real jsdom tree rather than against the source text.
 */

/**
 * jsdom has no layout, so `offsetParent` is null and `getClientRects()` is empty for every element.
 * The probe's visibility filter treats such a node as hidden; give every element a non-empty rect
 * list so the filter keeps nodes, exactly as a painted CoreBox would.
 */
let originalGetClientRects: typeof Element.prototype.getClientRects

beforeEach(() => {
  originalGetClientRects = Element.prototype.getClientRects
  Element.prototype.getClientRects = function getClientRects(): DOMRectList {
    return {
      length: 1,
      item: () => null,
      [Symbol.iterator]: function* iterate() {}
    } as unknown as DOMRectList
  }
})

afterEach(() => {
  Element.prototype.getClientRects = originalGetClientRects
})

function runDomSummary(): {
  resultRowCount: number
  noticeRowCount: number
} {
  document.body.innerHTML = `
    <div class="CoreBoxRes CoreBoxRes--visible">
      <div class="BoxItem" id="file-row">tuff-everything-ci-marker.txt</div>
      <div class="BoxItem BoxItem--notice" id="notice-row">Everything backend unavailable</div>
      <div class="BoxItem" id="file-row-2">another result</div>
    </div>
    <div class="CoreBox-SearchStatus-Live"></div>
  `
  // eslint-disable-next-line no-new-func
  return new Function(`return ${buildDomSummaryExpression()}`)() as {
    resultRowCount: number
    noticeRowCount: number
  }
}

describe('probe DOM row classification', () => {
  it('does not count a degraded notification row as a file result row', () => {
    const summary = runDomSummary()
    expect(summary.resultRowCount).toBe(2)
    expect(summary.noticeRowCount).toBe(1)
  })

  it('reports zero file rows when only a notification is rendered', () => {
    document.body.innerHTML = `
      <div class="CoreBoxRes CoreBoxRes--visible">
        <div class="BoxItem BoxItem--notice">Everything backend unavailable</div>
      </div>
    `
    // eslint-disable-next-line no-new-func
    const summary = new Function(`return ${buildDomSummaryExpression()}`)() as {
      resultRowCount: number
      noticeRowCount: number
    }
    expect(summary.resultRowCount).toBe(0)
    expect(summary.noticeRowCount).toBe(1)
  })
})

/**
 * The consumer-visible contract of a packaged Everything search: a mode routed to Everything must be
 * answered by the real expected backend, and a query-time SDK failure that silently recovers through
 * the CLI must be caught. `resultSource` cannot see it (both SDK and CLI report as
 * `everything-provider`), and the performance counters are a bounded ring that saturates, so the
 * only evidence is the advance (and status) of the diagnostics stages across the typed query. These
 * cases drive the exported checker with two non-refresh snapshots; assertions name behaviour, not
 * the probe's phrasing.
 */
function everythingStatus(
  over: {
    backend?: EverythingStatusResponse['backend']
    available?: boolean
    stages?: Partial<
      Record<EverythingDiagnosticStage, number | { timestamp: number; status: EverythingDiagnosticStatus }>
    >
    performance?: Partial<NonNullable<EverythingStatusResponse['performance']>>
  } = {}
): EverythingStatusResponse {
  const stages: EverythingStatusResponse['diagnostics'] = { stages: {}, lastUpdated: 1 }
  for (const [name, value] of Object.entries(over.stages ?? {})) {
    const stageName = name as EverythingDiagnosticStage
    const detail =
      typeof value === 'number' ? { timestamp: value, status: 'success' as const } : value
    stages.stages[stageName] = {
      stage: stageName,
      status: detail.status,
      backend: 'sdk-napi',
      timestamp: detail.timestamp
    }
  }
  return {
    enabled: true,
    available: over.available ?? true,
    backend: over.backend ?? 'sdk-napi',
    health: 'ready',
    healthReason: null,
    version: '1.4.1.1026',
    esPath: null,
    configuredCliPath: null,
    error: null,
    errorCode: null,
    lastBackendError: null,
    backendAttemptErrors: {},
    fallbackChain: ['sdk-napi', 'cli'],
    lastChecked: 1,
    pathFiltering: {
      enabled: false,
      allowedRootCount: 0,
      lastRawResultCount: null,
      lastFilteredResultCount: null,
      lastDroppedResultCount: null,
      lastChecked: null,
      reason: null
    },
    performance: {
      sampleCount: 0,
      durationSampleCount: 0,
      p50Ms: null,
      p95Ms: null,
      maxMs: null,
      successCount: 0,
      timeoutCount: 0,
      errorCount: 0,
      abortedCount: 0,
      sdkCount: 0,
      cliCount: 0,
      fallbackCount: 0,
      fallbackRatio: 0,
      ...over.performance
    },
    diagnostics: stages
  }
}

describe('checkEverythingModeBackendUsage', () => {
  const mode: EverythingCoreBoxSearchModeId = 'normal'

  it('passes an Everything mode answered by the SDK with no CLI fallback', () => {
    const failures = checkEverythingModeBackendUsage({
      mode,
      everythingSourced: true,
      expectedBackend: 'sdk-napi',
      before: everythingStatus({ stages: { 'sdk-query': 100 } }),
      after: everythingStatus({ stages: { 'sdk-query': { timestamp: 200, status: 'success' } } })
    })
    expect(failures).toEqual([])
  })

  /**
   * The false-green this check exists to catch: the SDK query was attempted, failed, and the app
   * recovered through the CLI, so the mode still reported rows and the pure gate is green. The
   * advancing `cli-query` stage is the observable signature.
   */
  it('fails an Everything mode that recovered from a failed SDK query via the CLI', () => {
    const failures = checkEverythingModeBackendUsage({
      mode,
      everythingSourced: true,
      expectedBackend: 'sdk-napi',
      before: everythingStatus({ stages: { 'sdk-query': 100 } }),
      after: everythingStatus({
        stages: {
          'sdk-query': { timestamp: 200, status: 'failed' },
          'cli-query': { timestamp: 201, status: 'success' }
        }
      })
    })
    expect(failures.length).toBeGreaterThan(0)
  })

  it('fails an Everything mode that ran no SDK query at all', () => {
    const failures = checkEverythingModeBackendUsage({
      mode,
      everythingSourced: true,
      expectedBackend: 'sdk-napi',
      before: everythingStatus({ stages: { 'sdk-query': 100 } }),
      after: everythingStatus({ stages: {} })
    })
    expect(failures.length).toBeGreaterThan(0)
  })

  /**
   * A stage timestamp that did not move means the query never actually ran; a stale snapshot must
   * not be read as a successful SDK sample.
   */
  it('fails an Everything mode whose SDK stage timestamp did not advance', () => {
    const failures = checkEverythingModeBackendUsage({
      mode,
      everythingSourced: true,
      expectedBackend: 'sdk-napi',
      before: everythingStatus({ stages: { 'sdk-query': 100 } }),
      after: everythingStatus({ stages: { 'sdk-query': { timestamp: 100, status: 'success' } } })
    })
    expect(failures.length).toBeGreaterThan(0)
  })

  it('fails an Everything mode whose SDK query ended as failed', () => {
    const failures = checkEverythingModeBackendUsage({
      mode,
      everythingSourced: true,
      expectedBackend: 'sdk-napi',
      before: everythingStatus({ stages: { 'sdk-query': 100 } }),
      after: everythingStatus({ stages: { 'sdk-query': { timestamp: 200, status: 'failed' } } })
    })
    expect(failures.length).toBeGreaterThan(0)
  })

  it('passes a CLI-backed Everything mode answered by a successful CLI query', () => {
    const failures = checkEverythingModeBackendUsage({
      mode,
      everythingSourced: true,
      expectedBackend: 'cli',
      before: everythingStatus({ backend: 'cli', stages: { 'cli-query': 100 } }),
      after: everythingStatus({
        backend: 'cli',
        stages: {
          'sdk-query': { timestamp: 200, status: 'failed' },
          'cli-query': { timestamp: 201, status: 'success' }
        }
      })
    })
    expect(failures).toEqual([])
  })

  it('fails a CLI-backed Everything mode that ran no CLI query', () => {
    const failures = checkEverythingModeBackendUsage({
      mode,
      everythingSourced: true,
      expectedBackend: 'cli',
      before: everythingStatus({ backend: 'cli', stages: { 'cli-query': 100 } }),
      after: everythingStatus({ backend: 'cli', stages: {} })
    })
    expect(failures.length).toBeGreaterThan(0)
  })

  /**
   * With the CLI as the expected backend, a `normal` (Everything-sourced) mode that has no SDK
   * diagnostics at all is legitimately answered by the CLI only, so it must pass — the SDK is not
   * required when the runtime reported the CLI backend.
   */
  it('passes a CLI-only Everything mode answered by the CLI without SDK diagnostics', () => {
    const failures = checkEverythingModeBackendUsage({
      mode,
      everythingSourced: true,
      expectedBackend: 'cli',
      before: everythingStatus({ backend: 'cli', stages: { 'cli-query': 100 } }),
      after: everythingStatus({ backend: 'cli', stages: { 'cli-query': { timestamp: 201, status: 'success' } } })
    })
    expect(failures).toEqual([])
  })

  /**
   * The performance summary is a bounded ring that saturates: once full, `sdkCount` stops moving, so
   * a count delta proves nothing. The stage timestamp still advances, and that is what must decide
   * the mode — a saturated ring with a fresh successful `sdk-query` stage passes.
   */
  it('passes an SDK mode whose counters are saturated but whose SDK stage advanced', () => {
    const saturated = { sdkCount: 999, sampleCount: 200 }
    const failures = checkEverythingModeBackendUsage({
      mode,
      everythingSourced: true,
      expectedBackend: 'sdk-napi',
      before: everythingStatus({
        stages: { 'sdk-query': 100 },
        performance: saturated
      }),
      after: everythingStatus({
        stages: { 'sdk-query': { timestamp: 200, status: 'success' } },
        performance: saturated
      })
    })
    expect(failures).toEqual([])
  })

  /**
   * A status read that carries no diagnostics block at all cannot be read as an SDK sample: with no
   * `sdk-query` stage there is no proof the query ran, so an SDK mode fails rather than passing.
   */
  it('fails an SDK mode whose status read carries no diagnostics stages', () => {
    const withoutDiagnostics = everythingStatus({ stages: { 'sdk-query': 100 } })
    delete withoutDiagnostics.diagnostics
    const failures = checkEverythingModeBackendUsage({
      mode,
      everythingSourced: true,
      expectedBackend: 'sdk-napi',
      before: everythingStatus({ stages: { 'sdk-query': 100 } }),
      after: withoutDiagnostics
    })
    expect(failures.length).toBeGreaterThan(0)
  })

  it('passes a clean unavailable backend with no query stage at all', () => {
    const failures = checkEverythingModeBackendUsage({
      mode,
      everythingSourced: true,
      expectedBackend: 'unavailable',
      before: everythingStatus({ backend: 'unavailable', available: false }),
      after: everythingStatus({ backend: 'unavailable', available: false })
    })
    expect(failures).toEqual([])
  })

  it('fails when Everything ran a query while the backend was unavailable', () => {
    const failures = checkEverythingModeBackendUsage({
      mode,
      everythingSourced: true,
      expectedBackend: 'unavailable',
      before: everythingStatus({ backend: 'unavailable', available: false }),
      after: everythingStatus({
        backend: 'unavailable',
        available: false,
        stages: { 'sdk-query': 200 }
      })
    })
    expect(failures.length).toBeGreaterThan(0)
  })

  it('fails when the query changed the Everything backend away from the expectation', () => {
    const failures = checkEverythingModeBackendUsage({
      mode,
      everythingSourced: true,
      expectedBackend: 'sdk-napi',
      before: everythingStatus({ backend: 'sdk-napi', stages: { 'sdk-query': 100 } }),
      after: everythingStatus({
        backend: 'cli',
        stages: { 'sdk-query': { timestamp: 200, status: 'failed' }, 'cli-query': 201 }
      })
    })
    expect(failures.length).toBeGreaterThan(0)
  })

  /**
   * A mode answered by the local file index (`structured-filter`) is not required to run an
   * Everything query, so no stage advance is not a failure there.
   */
  it('passes a file-index-sourced mode that ran no Everything query', () => {
    const failures = checkEverythingModeBackendUsage({
      mode: 'structured-filter',
      everythingSourced: false,
      expectedBackend: 'sdk-napi',
      before: everythingStatus({ stages: { 'sdk-query': 100 } }),
      after: everythingStatus({ stages: { 'sdk-query': { timestamp: 100, status: 'success' } } })
    })
    expect(failures).toEqual([])
  })

  it('tolerates null snapshots instead of failing on a missing status read', () => {
    const failures = checkEverythingModeBackendUsage({
      mode,
      everythingSourced: false,
      expectedBackend: 'unavailable',
      before: null,
      after: null
    })
    expect(failures).toEqual([])
  })
})
