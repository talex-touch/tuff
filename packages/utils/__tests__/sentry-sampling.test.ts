import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  resolveSentryTracesSampleRate,
  SENTRY_TRACES_SAMPLE_RATE_DEVELOPMENT,
  SENTRY_TRACES_SAMPLE_RATE_PRODUCTION
} from '../base/sentry-sampling'

/**
 * Shipped builds must not trace every transaction (#799).
 *
 * A flat 1.0 uploads every transaction from a long-running desktop app, on the user's machine and
 * network. The failure that matters is not the overhead: once the project quota is hit Sentry
 * rate-limits it, and genuine **error** events start being dropped — so full trace sampling
 * degrades exactly the observability it exists to provide.
 *
 * Both initialisers already knew whether they were a shipped build (`app.isPackaged` in main,
 * `buildInfo.isRelease` in the renderer) and used it for `environment` while sampling ignored it.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')

describe('resolveSentryTracesSampleRate', () => {
  it('traces everything in development', () => {
    expect(resolveSentryTracesSampleRate({ isDevelopment: true })).toBe(
      SENTRY_TRACES_SAMPLE_RATE_DEVELOPMENT
    )
  })

  it('samples a shipped build', () => {
    // Positive control for the case above: a resolver that always returned 1 would satisfy it.
    const rate = resolveSentryTracesSampleRate({ isDevelopment: false })

    expect(rate).toBe(SENTRY_TRACES_SAMPLE_RATE_PRODUCTION)
    expect(rate).toBeLessThan(1)
    expect(rate).toBeGreaterThan(0)
  })

  it('honours an explicit override for a targeted investigation', () => {
    expect(resolveSentryTracesSampleRate({ isDevelopment: false, override: '0.5' })).toBe(0.5)
    expect(resolveSentryTracesSampleRate({ isDevelopment: false, override: '0' })).toBe(0)
  })

  it('ignores an override that is out of range rather than clamping it', () => {
    // `10` meaning "10 percent" is the plausible typo. Clamping it to 1 would silently restore the
    // state being fixed, so it falls back to the default instead.
    for (const override of ['10', '-1', 'half', '', '   ']) {
      expect(resolveSentryTracesSampleRate({ isDevelopment: false, override }), override).toBe(
        SENTRY_TRACES_SAMPLE_RATE_PRODUCTION
      )
    }
  })
})

describe('both initialisers use it', () => {
  const sources = [
    'apps/core-app/src/main/modules/sentry/sentry-service.ts',
    'apps/core-app/src/renderer/src/modules/sentry/sentry-renderer.ts'
  ].map((file) => ({ file, source: readFileSync(path.join(REPO_ROOT, file), 'utf8') }))

  it('reads both files', () => {
    // Positive control: the absence checks below are satisfied by an unreadable path.
    expect(sources).toHaveLength(2)
    for (const { source } of sources) expect(source).toContain('Sentry.init(')
  })

  it('resolves the rate instead of hard-coding it', () => {
    for (const { file, source } of sources) {
      expect(source, file).toContain('resolveSentryTracesSampleRate(')
      expect(source, file).not.toMatch(/tracesSampleRate:\s*1(\.0)?\s*,/)
    }
  })
})
