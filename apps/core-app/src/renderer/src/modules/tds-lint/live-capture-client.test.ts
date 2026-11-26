// @vitest-environment jsdom

import type { TdsCaptureRenderRequest } from '@talex-touch/utils/transport/sdk/domains/tds-capture'
import { TdsCaptureEvents } from '@talex-touch/utils/transport/sdk/domains/tds-capture'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TdsLintIssue } from './types'

const mocks = vi.hoisted(() => ({
  isElectron: true,
  send: vi.fn()
}))

vi.mock('@talex-touch/utils/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/env')>()
  return {
    ...actual,
    isElectronRenderer: () => mocks.isElectron
  }
})

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: mocks.send })
}))

import {
  buildCaptureCacheKey,
  captureFrameAndProbe,
  clearCaptureCache,
  getCaptureCacheStats,
  MAX_CAPTURE_CACHE_BYTES,
  MAX_CAPTURE_CONCURRENCY,
  mergeLintIssues,
  releaseCaptureSession,
  setCaptureCacheMaxBytesForTests
} from './live-capture-client'

const SAMPLE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('live-capture-client', () => {
  beforeEach(() => {
    mocks.isElectron = true
    mocks.send.mockReset()
    clearCaptureCache()
    setCaptureCacheMaxBytesForTests(MAX_CAPTURE_CACHE_BYTES)
  })

  afterEach(() => {
    clearCaptureCache()
    setCaptureCacheMaxBytesForTests(MAX_CAPTURE_CACHE_BYTES)
  })

  it('produces deterministic cache keys sensitive to srcdoc, viewport, format, pixelRatio, and probe script', () => {
    const base = {
      srcdoc: '<!doctype html><body><h1>Hello</h1></body>',
      width: 402,
      height: 874,
      format: 'jpeg' as const,
      pixelRatio: 1
    }
    const key1 = buildCaptureCacheKey(base)
    const key2 = buildCaptureCacheKey({ ...base })
    expect(key1).toBe(key2)
    expect(buildCaptureCacheKey({ ...base, width: 390 })).not.toBe(key1)
    expect(buildCaptureCacheKey({ ...base, height: 844 })).not.toBe(key1)
    expect(buildCaptureCacheKey({ ...base, format: 'png' })).not.toBe(key1)
    expect(buildCaptureCacheKey({ ...base, pixelRatio: 2 })).not.toBe(key1)
    expect(
      buildCaptureCacheKey({ ...base, srcdoc: '<!doctype html><body><h1>Other</h1></body>' })
    ).not.toBe(key1)
    expect(buildCaptureCacheKey({ ...base, domProbeScript: '(function(){return []})()' })).not.toBe(
      key1
    )
  })

  it('degrades gracefully with { ok: false } when not running in Electron or when transport rejects', async () => {
    mocks.isElectron = false
    const nonElectron = await captureFrameAndProbe({
      srcdoc: '<h1>Web</h1>',
      width: 400,
      height: 600
    })
    expect(nonElectron).toEqual({
      ok: false,
      domIssues: [],
      fromCache: false
    })
    expect(mocks.send).not.toHaveBeenCalled()
    expect(await releaseCaptureSession('canvas:1')).toBe(false)

    // Electron active, transport throws -> non-throwing { ok: false }
    mocks.isElectron = true
    mocks.send.mockRejectedValueOnce(new Error('IPC channel unavailable'))
    const failed = await captureFrameAndProbe({
      srcdoc: '<h1>Fail</h1>',
      width: 400,
      height: 600
    })
    expect(failed.ok).toBe(false)
    expect(failed.domIssues).toEqual([])
    expect(failed.fromCache).toBe(false)
    expect(failed.error).toContain('IPC channel unavailable')
  })

  it('caches results in a bounded LRU cache and evicts least-recently-used entries beyond budget', async () => {
    setCaptureCacheMaxBytesForTests(4096)

    const makeLargeDataUrl = (tag: string) => `data:image/jpeg;base64,${tag.repeat(1600)}`

    mocks.send.mockImplementation(async (_event: unknown, req: TdsCaptureRenderRequest) => {
      const tag = req.srcdoc.includes('A') ? 'A' : req.srcdoc.includes('B') ? 'B' : 'C'
      return {
        ok: true,
        bitmapDataUrl: makeLargeDataUrl(tag),
        width: req.width,
        height: req.height,
        domProbeResult: [
          {
            ruleId: 'contrast-fail',
            phase: 'dom',
            severity: 'error',
            category: 'contrast',
            message: `Low contrast in ${tag}`,
            fixHint: 'Use --shell-text-primary',
            selector: `p#${tag}`
          }
        ],
        durationMs: 12
      }
    })

    // 1. Insert A and B (total ~3.6 KB <= 4096 bytes)
    const resA1 = await captureFrameAndProbe({ srcdoc: '<p>A</p>', width: 390, height: 844 })
    expect(resA1.ok).toBe(true)
    expect(resA1.fromCache).toBe(false)
    expect(resA1.domIssues).toHaveLength(1)
    expect(resA1.domIssues[0]?.phase).toBe('dom')

    const resB1 = await captureFrameAndProbe({ srcdoc: '<p>B</p>', width: 390, height: 844 })
    expect(resB1.ok).toBe(true)
    expect(resB1.fromCache).toBe(false)

    // 2. Touch A -> cache hit refreshes A's recency so B becomes LRU!
    const resA2 = await captureFrameAndProbe({ srcdoc: '<p>A</p>', width: 390, height: 844 })
    expect(resA2.ok).toBe(true)
    expect(resA2.fromCache).toBe(true)
    expect(mocks.send).toHaveBeenCalledTimes(2)

    // 3. Insert C -> exceeds 4096 bytes, must evict B while keeping A and C!
    const resC1 = await captureFrameAndProbe({ srcdoc: '<p>C</p>', width: 390, height: 844 })
    expect(resC1.ok).toBe(true)
    expect(resC1.fromCache).toBe(false)

    const stats = getCaptureCacheStats()
    expect(stats.bytes).toBeLessThanOrEqual(4096)
    expect(stats.entries).toBe(2)
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(3)

    // A is still cached (hit), B was evicted (miss)
    const resA3 = await captureFrameAndProbe({ srcdoc: '<p>A</p>', width: 390, height: 844 })
    expect(resA3.fromCache).toBe(true)
    const resB2 = await captureFrameAndProbe({ srcdoc: '<p>B</p>', width: 390, height: 844 })
    expect(resB2.fromCache).toBe(false)
    expect(mocks.send).toHaveBeenCalledTimes(4)
  })

  it('deduplicates identical concurrent in-flight capture requests into one IPC call', async () => {
    const deferred: { resolve: ((value: unknown) => void) | null } = { resolve: null }
    mocks.send.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.resolve = resolve
        })
    )

    const input = {
      srcdoc: '<!doctype html><body><h1>Shared</h1></body>',
      width: 402,
      height: 874
    }
    const p1 = captureFrameAndProbe(input)
    const p2 = captureFrameAndProbe(input)
    const p3 = captureFrameAndProbe(input)

    try {
      expect(mocks.send).toHaveBeenCalledTimes(1)
      expect(getCaptureCacheStats().inFlight).toBe(1)

      deferred.resolve?.({
        ok: true,
        bitmapDataUrl: SAMPLE_PNG_DATA_URL,
        width: 402,
        height: 874,
        domProbeResult: [],
        durationMs: 20
      })
      deferred.resolve = null

      const [r1, r2, r3] = await Promise.all([p1, p2, p3])
      expect(r1.ok).toBe(true)
      expect(r2.ok).toBe(true)
      expect(r3.ok).toBe(true)
      expect(r1.bitmapDataUrl).toBe(SAMPLE_PNG_DATA_URL)
      expect(r2.bitmapDataUrl).toBe(SAMPLE_PNG_DATA_URL)
      expect(mocks.send).toHaveBeenCalledTimes(1)
      expect(getCaptureCacheStats().inFlight).toBe(0)
    } finally {
      if (deferred.resolve) {
        deferred.resolve({ ok: false, width: 402, height: 874, durationMs: 0 })
        await Promise.allSettled([p1, p2, p3])
      }
    }
  })

  it('enforces MAX_CAPTURE_CONCURRENCY <= 2 across distinct capture requests', async () => {
    let currentConcurrent = 0
    let peakConcurrent = 0
    const pendingResolvers: Array<() => void> = []

    mocks.send.mockImplementation((_event: unknown, req: TdsCaptureRenderRequest) => {
      currentConcurrent += 1
      peakConcurrent = Math.max(peakConcurrent, currentConcurrent)
      return new Promise((resolve) => {
        pendingResolvers.push(() => {
          currentConcurrent -= 1
          resolve({
            ok: true,
            bitmapDataUrl: SAMPLE_PNG_DATA_URL,
            width: req.width,
            height: req.height,
            domProbeResult: [],
            durationMs: 10
          })
        })
      })
    })

    const requests = [1, 2, 3, 4, 5].map((i) =>
      captureFrameAndProbe({
        srcdoc: `<h1>Frame ${i}</h1>`,
        width: 400,
        height: 600
      })
    )

    try {
      await Promise.resolve()
      expect(peakConcurrent).toBe(MAX_CAPTURE_CONCURRENCY)
      expect(mocks.send).toHaveBeenCalledTimes(MAX_CAPTURE_CONCURRENCY)
      expect(getCaptureCacheStats().queuedRequests).toBe(3)

      // Drain FIFO until all 5 complete
      while (pendingResolvers.length > 0) {
        const next = pendingResolvers.shift()!
        next()
        await Promise.resolve()
        await Promise.resolve()
      }

      const results = await Promise.all(requests)
      expect(results.every((r) => r.ok)).toBe(true)
      expect(peakConcurrent).toBe(MAX_CAPTURE_CONCURRENCY)
      expect(mocks.send).toHaveBeenCalledTimes(5)
      expect(getCaptureCacheStats().activeRequests).toBe(0)
      expect(getCaptureCacheStats().queuedRequests).toBe(0)
    } finally {
      while (pendingResolvers.length > 0) {
        pendingResolvers.shift()!()
        await Promise.resolve()
      }
      await Promise.allSettled(requests)
    }
  })

  it('sanitizes unsafe bitmap URLs and malformed DOM probe entries and supports releaseCaptureSession', async () => {
    mocks.send.mockResolvedValueOnce({
      ok: true,
      bitmapDataUrl: 'data:image/svg+xml,<svg onload=alert(1)/>',
      width: 400,
      height: 600,
      domProbeResult: [
        null,
        { ruleId: '', severity: 'error', category: 'icons', message: 'invalid' },
        {
          ruleId: 'icon-missing',
          phase: 'static', // forced to 'dom' by sanitizer
          severity: 'error',
          category: 'icons',
          message: 'Missing icon',
          fixHint: 'Use inline svg',
          selector: 'i#missing'
        }
      ],
      durationMs: 8
    })

    const res = await captureFrameAndProbe({
      srcdoc: '<i id="missing" class="i-ri-home-line"></i>',
      width: 400,
      height: 600
    })
    expect(res.ok).toBe(true)
    expect(res.bitmapDataUrl).toBeUndefined()
    expect(res.domIssues).toHaveLength(1)
    expect(res.domIssues[0]).toMatchObject({
      ruleId: 'icon-missing',
      phase: 'dom',
      severity: 'error',
      selector: 'i#missing'
    })

    mocks.send.mockResolvedValueOnce({ released: true })
    const released = await releaseCaptureSession('canvas:conv-1')
    expect(released).toBe(true)
    expect(mocks.send).toHaveBeenLastCalledWith(TdsCaptureEvents.releaseSession, {
      sessionKey: 'canvas:conv-1'
    })
  })

  it('merges static and DOM lint issues while preserving phase and deduplicating identical entries', () => {
    const staticIssues: TdsLintIssue[] = [
      {
        ruleId: 'remote-asset-url',
        phase: 'static',
        severity: 'error',
        category: 'sandbox',
        message: 'Remote asset blocked',
        fixHint: 'Inline asset',
        line: 5
      },
      {
        ruleId: 'remote-asset-url',
        phase: 'static',
        severity: 'error',
        category: 'sandbox',
        message: 'Remote asset blocked',
        fixHint: 'Inline asset',
        line: 5
      }
    ]
    const domIssues: TdsLintIssue[] = [
      {
        ruleId: 'contrast-fail',
        phase: 'dom',
        severity: 'error',
        category: 'contrast',
        message: 'Low contrast 2.1:1',
        fixHint: 'Use --shell-text-primary',
        selector: 'p.muted'
      },
      {
        ruleId: 'contrast-fail',
        phase: 'dom',
        severity: 'error',
        category: 'contrast',
        message: 'Low contrast 2.1:1',
        fixHint: 'Use --shell-text-primary',
        selector: 'p.muted'
      }
    ]

    const merged = mergeLintIssues(staticIssues, domIssues)
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ ruleId: 'remote-asset-url', phase: 'static', line: 5 })
    expect(merged[1]).toMatchObject({ ruleId: 'contrast-fail', phase: 'dom', selector: 'p.muted' })
  })

  it('preserves captured bitmap and reports probeError without caching when DOM_PROBE_FAILED occurs, while still caching clean empty probes', async () => {
    const validPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    // 1. Main returns bitmap + DOM_PROBE_FAILED -> bitmap preserved, probeError reported, NOT cached
    mocks.send.mockResolvedValueOnce({
      ok: true,
      bitmapDataUrl: validPng,
      width: 390,
      height: 844,
      error: 'DOM_PROBE_FAILED:Script threw TypeError',
      durationMs: 18
    })

    const first = await captureFrameAndProbe({
      srcdoc: '<main>Probe error test</main>',
      width: 390,
      height: 844,
      domProbeScript: '(() => { throw new TypeError("boom") })()'
    })
    expect(first.ok).toBe(true)
    expect(first.bitmapDataUrl).toBe(validPng)
    expect(first.domIssues).toEqual([])
    expect(first.probeError).toBe('DOM_PROBE_FAILED:Script threw TypeError')
    expect(first.error).toBe('DOM_PROBE_FAILED:Script threw TypeError')
    expect(getCaptureCacheStats().entries).toBe(0)

    // 2. Retry succeeds with clean empty [] probe -> cached cleanly
    mocks.send.mockResolvedValueOnce({
      ok: true,
      bitmapDataUrl: validPng,
      width: 390,
      height: 844,
      domProbeResult: [],
      durationMs: 12
    })

    const second = await captureFrameAndProbe({
      srcdoc: '<main>Probe error test</main>',
      width: 390,
      height: 844,
      domProbeScript: '(() => { throw new TypeError("boom") })()'
    })
    expect(second.ok).toBe(true)
    expect(second.probeError).toBeUndefined()
    expect(second.domIssues).toEqual([])
    expect(second.fromCache).toBe(false)
    expect(getCaptureCacheStats().entries).toBe(1)

    // 3. Third call hits cache for the clean empty probe
    const third = await captureFrameAndProbe({
      srcdoc: '<main>Probe error test</main>',
      width: 390,
      height: 844,
      domProbeScript: '(() => { throw new TypeError("boom") })()'
    })
    expect(third.ok).toBe(true)
    expect(third.fromCache).toBe(true)
    expect(mocks.send).toHaveBeenCalledTimes(2)
  })
})
