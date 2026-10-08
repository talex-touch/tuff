import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CoreBoxFocusCode,
  CoreBoxFocusNativeSnapshot,
  CoreBoxFocusProbeRequest,
  CoreBoxFocusProbeResponse,
  CoreBoxFocusTelemetryRecord
} from '@talex-touch/utils/core-box/focus-diagnostics'
import {
  COREBOX_FOCUS_FIRST_SAMPLE_MS,
  COREBOX_FOCUS_PROBE_TIMEOUT_MS,
  COREBOX_FOCUS_SAMPLE_COUNT,
  COREBOX_FOCUS_SAMPLE_INTERVAL_MS,
  CoreBoxFocusDiagnostics
} from './focus-diagnostics'

/**
 * The observer is a pure function of three injected seams: a native snapshot reader, a probe
 * dispatcher, and a telemetry sink. Every contract a real caller depends on — which samples get
 * recorded, with which fixed code, in which order, and which don't get fabricated — is observable
 * through those seams, so these tests drive the real class instead of a mock of it.
 */

interface Harness {
  diagnostics: CoreBoxFocusDiagnostics
  records: CoreBoxFocusTelemetryRecord[]
  probes: CoreBoxFocusProbeRequest[]
  setNative: (native: CoreBoxFocusNativeSnapshot) => void
  failNative: (error: unknown) => void
  failDispatch: (error: unknown) => void
}

function focusedNative(
  overrides: Partial<CoreBoxFocusNativeSnapshot> = {}
): CoreBoxFocusNativeSnapshot {
  return {
    windowAlive: true,
    visible: true,
    windowFocused: true,
    webContentsFocused: true,
    pluginActive: false,
    pluginFocused: false,
    metaVisible: false,
    metaFocused: false,
    ...overrides
  }
}

function createHarness(): Harness {
  const records: CoreBoxFocusTelemetryRecord[] = []
  const probes: CoreBoxFocusProbeRequest[] = []
  let native = focusedNative()
  let nativeError: unknown = null
  let dispatchError: unknown = null

  const diagnostics = new CoreBoxFocusDiagnostics({
    readNative: () => {
      if (nativeError) throw nativeError
      return native
    },
    dispatchProbe: (request) => {
      probes.push(request)
      if (dispatchError) throw dispatchError
    },
    emit: (record) => {
      records.push(record)
    }
  })

  return {
    diagnostics,
    records,
    probes,
    setNative: (next) => {
      native = next
    },
    failNative: (error) => {
      nativeError = error
    },
    failDispatch: (error) => {
      dispatchError = error
    }
  }
}

/** A renderer reply that a fully focused search input would produce. */
function focusResponse(
  request: CoreBoxFocusProbeRequest,
  overrides: Partial<Omit<CoreBoxFocusProbeResponse, 'summonId' | 'sampleIndex'>> = {}
): CoreBoxFocusProbeResponse {
  return {
    summonId: request.summonId,
    sampleIndex: request.sampleIndex,
    documentFocused: true,
    inputPresent: true,
    inputFocused: true,
    expectedTarget: 'input',
    expectedTargetPresent: true,
    expectedTargetFocused: true,
    ...overrides
  }
}

function sampleRecords(records: CoreBoxFocusTelemetryRecord[]): CoreBoxFocusTelemetryRecord[] {
  return records.filter((record) => record.stage === 'sample')
}

function sampleByIndex(
  records: CoreBoxFocusTelemetryRecord[],
  index: number
): CoreBoxFocusTelemetryRecord | undefined {
  return sampleRecords(records).find((record) => record.sampleIndex === index)
}

function completion(
  records: CoreBoxFocusTelemetryRecord[]
): CoreBoxFocusTelemetryRecord | undefined {
  return records.find((record) => record.stage === 'complete')
}

/**
 * Walks the real 200ms-then-100ms schedule, answering whichever probes each tick dispatches.
 * `reply` returning null leaves the probe unanswered so its 250ms deadline runs out naturally.
 */
async function runSession(
  harness: Harness,
  reply?: (request: CoreBoxFocusProbeRequest, index: number) => CoreBoxFocusProbeResponse | null
): Promise<string> {
  const summonId = harness.diagnostics.start('shortcut')
  harness.diagnostics.shown(summonId)
  for (let step = 0; step < COREBOX_FOCUS_SAMPLE_COUNT; step++) {
    const dispatchedBefore = harness.probes.length
    await vi.advanceTimersByTimeAsync(
      step === 0 ? COREBOX_FOCUS_FIRST_SAMPLE_MS : COREBOX_FOCUS_SAMPLE_INTERVAL_MS
    )
    for (let index = dispatchedBefore; index < harness.probes.length; index++) {
      const request = harness.probes[index]
      const response = reply?.(request, index + 1)
      if (response) harness.diagnostics.receiveProbe(response)
    }
    await vi.advanceTimersByTimeAsync(0)
  }
  // Let any probe the renderer never answered reach its deadline.
  await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_PROBE_TIMEOUT_MS)
  return summonId
}

describe('CoreBoxFocusDiagnostics native window observation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('records every sample as a window-missing failure without probing a dead window', async () => {
    const harness = createHarness()
    harness.setNative(focusedNative({ windowAlive: false }))

    await runSession(harness)

    // A dead window has nobody to ask: dispatching a probe would be a phantom request, and
    // reporting the sample as focused would be a fabricated success.
    expect(harness.probes).toEqual([])

    const samples = sampleRecords(harness.records)
    expect(samples).toHaveLength(COREBOX_FOCUS_SAMPLE_COUNT)
    for (const sample of samples) {
      expect(sample.code).toBe<CoreBoxFocusCode>('COREBOX_FOCUS_WINDOW_MISSING')
      expect(sample.status).toBe('failed')
      expect(sample.severity).toBe('error')
    }
    expect(samples.map((sample) => sample.sampleIndex).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10
    ])

    const summary = completion(harness.records)
    expect(summary).toMatchObject({
      status: 'failed',
      completedSampleCount: COREBOX_FOCUS_SAMPLE_COUNT,
      failedSampleCount: COREBOX_FOCUS_SAMPLE_COUNT
    })
  })

  it('keeps a native snapshot exception as a failure instead of trusting a clean renderer reply', async () => {
    const harness = createHarness()
    harness.failNative(new Error('native snapshot unavailable'))

    await runSession(harness, (request) => focusResponse(request))

    // The renderer says everything is focused, but the main process could not observe the native
    // window. A silent `success` here is exactly the false-negative the diagnostics exist to kill.
    const samples = sampleRecords(harness.records)
    expect(samples).toHaveLength(COREBOX_FOCUS_SAMPLE_COUNT)
    for (const sample of samples) {
      expect(sample.code).toBe<CoreBoxFocusCode>('COREBOX_FOCUS_NATIVE_SNAPSHOT_FAILED')
      expect(sample.status).toBe('failed')
    }
    expect(completion(harness.records)).toMatchObject({ status: 'failed' })

    const nativeFailures = harness.records.filter(
      (record) => record.stage === 'native-focus' && record.status === 'failed'
    )
    expect(nativeFailures).toHaveLength(COREBOX_FOCUS_SAMPLE_COUNT)
    expect(
      nativeFailures.every((record) => record.code === 'COREBOX_FOCUS_NATIVE_SNAPSHOT_FAILED')
    ).toBe(true)
  })

  it.each([
    ['hidden', { visible: false }, 'COREBOX_FOCUS_WINDOW_HIDDEN'],
    ['unfocused', { windowFocused: false }, 'COREBOX_FOCUS_WINDOW_NOT_FOCUSED']
  ] as Array<[string, Partial<CoreBoxFocusNativeSnapshot>, CoreBoxFocusCode]>)(
    'fails a natively %s window even when the renderer claims the input is focused',
    async (_case, nativeOverride, expectedCode) => {
      const harness = createHarness()
      harness.setNative(focusedNative(nativeOverride))

      const summonId = harness.diagnostics.start('shortcut')
      harness.diagnostics.shown(summonId)
      await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_FIRST_SAMPLE_MS)
      harness.diagnostics.receiveProbe(focusResponse(harness.probes[0]))
      await vi.advanceTimersByTimeAsync(0)

      const sample = sampleByIndex(harness.records, 1)
      expect(sample?.code).toBe<CoreBoxFocusCode>(expectedCode)
      expect(sample?.status).toBe('failed')
    }
  )
})

describe('CoreBoxFocusDiagnostics renderer target observation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    [
      'a missing input',
      {
        expectedTargetPresent: false,
        expectedTargetFocused: false,
        inputPresent: false,
        inputFocused: false
      },
      'COREBOX_FOCUS_TARGET_MISSING'
    ],
    [
      'an input that exists but lost focus',
      { expectedTargetPresent: true, expectedTargetFocused: false, inputFocused: false },
      'COREBOX_FOCUS_TARGET_NOT_FOCUSED'
    ],
    [
      'a focused input in a document that lost focus',
      { documentFocused: false },
      'COREBOX_FOCUS_DOCUMENT_NOT_FOCUSED'
    ]
  ] as Array<[string, Partial<CoreBoxFocusProbeResponse>, CoreBoxFocusCode]>)(
    'reports %s with its own fixed code',
    async (_case, responseOverride, expectedCode) => {
      const harness = createHarness()
      const summonId = harness.diagnostics.start('shortcut')
      harness.diagnostics.shown(summonId)
      await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_FIRST_SAMPLE_MS)
      harness.diagnostics.receiveProbe(focusResponse(harness.probes[0], responseOverride))
      await vi.advanceTimersByTimeAsync(0)

      const sample = sampleByIndex(harness.records, 1)
      expect(sample?.code).toBe<CoreBoxFocusCode>(expectedCode)
      expect(sample?.status).toBe('failed')
    }
  )

  it('records a fully focused input as a success', async () => {
    const harness = createHarness()
    const summonId = harness.diagnostics.start('shortcut')
    harness.diagnostics.shown(summonId)
    await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_FIRST_SAMPLE_MS)
    harness.diagnostics.receiveProbe(focusResponse(harness.probes[0]))
    await vi.advanceTimersByTimeAsync(0)

    expect(sampleByIndex(harness.records, 1)).toMatchObject({
      status: 'success',
      code: 'COREBOX_FOCUS_OK'
    })
  })
})

describe('CoreBoxFocusDiagnostics probe timing and nonce isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('times out every sample the renderer never answers and never reports one as focused', async () => {
    const harness = createHarness()

    await runSession(harness)

    const samples = sampleRecords(harness.records)
    expect(samples).toHaveLength(COREBOX_FOCUS_SAMPLE_COUNT)
    for (const sample of samples) {
      expect(sample.code).toBe<CoreBoxFocusCode>('COREBOX_FOCUS_RENDERER_TIMEOUT')
      expect(sample.status).toBe('failed')
    }
    expect(samples.some((sample) => sample.status === 'success')).toBe(false)

    const rendererFailures = harness.records.filter(
      (record) => record.stage === 'renderer-focus' && record.status === 'failed'
    )
    expect(rendererFailures).toHaveLength(COREBOX_FOCUS_SAMPLE_COUNT)
    expect(
      rendererFailures.every((record) => record.code === 'COREBOX_FOCUS_RENDERER_TIMEOUT')
    ).toBe(true)

    expect(completion(harness.records)).toMatchObject({
      status: 'failed',
      failedSampleCount: COREBOX_FOCUS_SAMPLE_COUNT
    })
  })

  it('emits the first failing sample before the completion summary and keeps all ten indexes', async () => {
    const harness = createHarness()
    harness.setNative(focusedNative({ windowFocused: false }))

    await runSession(harness, (request) => focusResponse(request))

    const records = harness.records
    const firstFailedSample = records.findIndex(
      (record) => record.stage === 'sample' && record.status === 'failed'
    )
    const summaryIndex = records.findIndex((record) => record.stage === 'complete')
    expect(firstFailedSample).toBeGreaterThanOrEqual(0)
    // An error that only surfaces in the summary is a failure the operator never sees in time.
    expect(firstFailedSample).toBeLessThan(summaryIndex)

    const indexes = sampleRecords(records)
      .map((record) => record.sampleIndex)
      .sort((a, b) => a - b)
    expect(indexes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('turns a throwing probe dispatch into an invalid reply instead of a success', async () => {
    const harness = createHarness()
    harness.failDispatch(new Error('COREBOX_FOCUS_WINDOW_MISSING'))

    await runSession(harness)

    const samples = sampleRecords(harness.records)
    expect(samples).toHaveLength(COREBOX_FOCUS_SAMPLE_COUNT)
    for (const sample of samples) {
      expect(sample.code).toBe<CoreBoxFocusCode>('COREBOX_FOCUS_RENDERER_INVALID_REPLY')
      expect(sample.status).toBe('failed')
    }
    expect(completion(harness.records)).toMatchObject({ status: 'failed' })
  })

  it('rejects a malformed receipt and records the sample as an invalid reply', async () => {
    const harness = createHarness()
    const summonId = harness.diagnostics.start('shortcut')
    harness.diagnostics.shown(summonId)
    await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_FIRST_SAMPLE_MS)

    const request = harness.probes[0]
    harness.diagnostics.receiveProbe({
      ...focusResponse(request),
      inputFocused: 'yes'
    } as unknown as CoreBoxFocusProbeResponse)

    await vi.advanceTimersByTimeAsync(0)

    const sample = sampleByIndex(harness.records, 1)
    expect(sample?.code).toBe<CoreBoxFocusCode>('COREBOX_FOCUS_RENDERER_INVALID_REPLY')
    expect(sample?.status).toBe('failed')
  })

  it('does not let a previous summon receipt settle the current summon sample', async () => {
    const harness = createHarness()

    const firstSummon = harness.diagnostics.start('shortcut')
    harness.diagnostics.shown(firstSummon)
    await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_FIRST_SAMPLE_MS)
    const staleRequest = harness.probes[0]

    const currentSummon = harness.diagnostics.start('shortcut')
    harness.diagnostics.shown(currentSummon)
    await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_FIRST_SAMPLE_MS)
    const currentRequest = harness.probes.at(-1)
    expect(currentRequest).toMatchObject({ summonId: currentSummon, sampleIndex: 1 })

    // The previous summon's renderer now answers late. Its reply must not be mistaken for the
    // current summon's, or the schedule would report a probe that was never actually answered.
    expect(harness.diagnostics.receiveProbe(focusResponse(staleRequest))).toBe(false)

    await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_PROBE_TIMEOUT_MS)

    const currentSample = sampleRecords(harness.records).find(
      (record) => record.summonId === currentSummon && record.sampleIndex === 1
    )
    expect(currentSample?.code).toBe<CoreBoxFocusCode>('COREBOX_FOCUS_RENDERER_TIMEOUT')
    expect(currentSample?.status).toBe('failed')
  })

  it('rejects a receipt whose sample index has no pending probe', async () => {
    const harness = createHarness()
    const summonId = harness.diagnostics.start('shortcut')
    harness.diagnostics.shown(summonId)
    await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_FIRST_SAMPLE_MS)

    const request = harness.probes[0]
    harness.diagnostics.receiveProbe({ ...focusResponse(request), sampleIndex: 5 })
    harness.diagnostics.receiveProbe(focusResponse(request))
    // The same sample answered twice must settle once; the second reply has no pending probe,
    // so it silently does nothing rather than overwriting the first outcome.
    harness.diagnostics.receiveProbe({ ...focusResponse(request), inputFocused: false })

    await vi.advanceTimersByTimeAsync(0)
    expect(
      sampleRecords(harness.records).filter((record) => record.sampleIndex === 1)
    ).toHaveLength(1)
    expect(sampleByIndex(harness.records, 1)).toMatchObject({ status: 'success' })
  })

  it('ignores a receipt that arrives after its summon was cancelled', async () => {
    const harness = createHarness()
    const summonId = harness.diagnostics.start('shortcut')
    harness.diagnostics.shown(summonId)
    await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_FIRST_SAMPLE_MS)
    const request = harness.probes[0]

    harness.diagnostics.cancel('hidden')

    expect(harness.diagnostics.receiveProbe(focusResponse(request))).toBe(false)
  })

  it('does not restart the same summon when it is shown twice', async () => {
    const harness = createHarness()
    const summonId = harness.diagnostics.start('shortcut')

    harness.diagnostics.shown(summonId)
    harness.diagnostics.shown(summonId)

    await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_FIRST_SAMPLE_MS)
    expect(harness.probes).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_SAMPLE_INTERVAL_MS)
    expect(harness.probes.map((probe) => probe.sampleIndex)).toEqual([1, 2])
  })
})

describe('CoreBoxFocusDiagnostics legal focus ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  async function firstSample(
    native: CoreBoxFocusNativeSnapshot,
    response: Partial<CoreBoxFocusProbeResponse>
  ): Promise<CoreBoxFocusTelemetryRecord | undefined> {
    const harness = createHarness()
    harness.setNative(native)
    const summonId = harness.diagnostics.start('shortcut')
    harness.diagnostics.shown(summonId)
    await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_FIRST_SAMPLE_MS)
    harness.diagnostics.receiveProbe(focusResponse(harness.probes[0], response))
    await vi.advanceTimersByTimeAsync(0)
    return sampleByIndex(harness.records, 1)
  }

  it.each([
    ['flow selector', focusedNative(), { expectedTarget: 'flow' as const, inputFocused: false }],
    ['history panel', focusedNative(), { expectedTarget: 'history' as const, inputFocused: false }],
    [
      'meta overlay',
      focusedNative({ metaVisible: true, metaFocused: true }),
      {
        expectedTarget: 'input' as const,
        expectedTargetPresent: false,
        expectedTargetFocused: false,
        documentFocused: false,
        inputFocused: false
      }
    ],
    [
      'plugin view',
      focusedNative({ pluginActive: true, pluginFocused: true, webContentsFocused: false }),
      {
        expectedTarget: 'input' as const,
        expectedTargetPresent: false,
        expectedTargetFocused: false,
        documentFocused: false,
        inputFocused: false
      }
    ]
  ] as Array<[string, CoreBoxFocusNativeSnapshot, Partial<CoreBoxFocusProbeResponse>]>)(
    'accepts the %s as a legal focus owner while the search input is unfocused',
    async (_case, native, response) => {
      const sample = await firstSample(native, response)

      expect(sample).toMatchObject({ status: 'success', code: 'COREBOX_FOCUS_OK' })
    }
  )

  it('still fails a meta overlay that is visible but did not take focus', async () => {
    const sample = await firstSample(focusedNative({ metaVisible: true, metaFocused: false }), {
      expectedTarget: 'input',
      expectedTargetPresent: false,
      expectedTargetFocused: false,
      documentFocused: false,
      inputFocused: false
    })

    expect(sample).toMatchObject({
      status: 'failed',
      code: 'COREBOX_FOCUS_TARGET_NOT_FOCUSED',
      expectedTarget: 'meta-overlay'
    })
  })

  it('still fails a plugin view that is active but did not take focus', async () => {
    const sample = await firstSample(
      focusedNative({ pluginActive: true, pluginFocused: false, webContentsFocused: false }),
      {
        expectedTarget: 'input',
        expectedTargetPresent: false,
        expectedTargetFocused: false,
        documentFocused: false,
        inputFocused: false
      }
    )

    expect(sample).toMatchObject({
      status: 'failed',
      code: 'COREBOX_FOCUS_TARGET_NOT_FOCUSED',
      expectedTarget: 'plugin'
    })
  })
})

describe('CoreBoxFocusDiagnostics cancellation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('records only the unfinished samples as cancelled, never as success, and releases the schedule', async () => {
    const harness = createHarness()
    const summonId = harness.diagnostics.start('shortcut')
    harness.diagnostics.shown(summonId)

    // Sample 1 answers and completes; samples 2-10 are still scheduled.
    await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_FIRST_SAMPLE_MS)
    harness.diagnostics.receiveProbe(focusResponse(harness.probes[0]))
    await vi.advanceTimersByTimeAsync(0)
    expect(sampleByIndex(harness.records, 1)).toMatchObject({ status: 'success' })

    harness.diagnostics.cancel('shutdown')

    const cancelled = sampleRecords(harness.records).filter(
      (record) => record.status === 'cancelled'
    )
    expect(cancelled.map((record) => record.sampleIndex).sort((a, b) => a - b)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10
    ])
    expect(cancelled.every((record) => record.code === 'COREBOX_FOCUS_CANCELLED')).toBe(true)
    expect(cancelled.every((record) => record.reason === 'shutdown')).toBe(true)
    // A cancelled sample is not a checked sample: no fabricated success may appear for it.
    expect(
      sampleRecords(harness.records).some(
        (record) => record.sampleIndex > 1 && record.status !== 'cancelled'
      )
    ).toBe(false)

    const summary = harness.records.find((record) => record.stage === 'cancel')
    expect(summary).toMatchObject({
      status: 'cancelled',
      code: 'COREBOX_FOCUS_CANCELLED',
      reason: 'shutdown',
      completedSampleCount: 1,
      failedSampleCount: 0,
      cancelledSampleCount: 9
    })

    const recordCountAfterCancel = harness.records.length
    await vi.advanceTimersByTimeAsync(COREBOX_FOCUS_SAMPLE_COUNT * COREBOX_FOCUS_SAMPLE_INTERVAL_MS)
    expect(harness.records).toHaveLength(recordCountAfterCancel)
    expect(harness.diagnostics.summonId).toBeUndefined()
    expect(harness.diagnostics.isCurrent(summonId)).toBe(false)
    expect(harness.diagnostics.monitoring).toBe(false)
  })

  it('cancels a summon that was never shown without inventing any completed sample', () => {
    const harness = createHarness()
    harness.diagnostics.start('programmatic')

    harness.diagnostics.cancel('superseded')

    const samples = sampleRecords(harness.records)
    expect(samples).toHaveLength(COREBOX_FOCUS_SAMPLE_COUNT)
    expect(samples.every((record) => record.status === 'cancelled')).toBe(true)
    expect(sampleRecords(harness.records).some((record) => record.status === 'success')).toBe(false)
    expect(completion(harness.records)).toBeUndefined()
  })
})
