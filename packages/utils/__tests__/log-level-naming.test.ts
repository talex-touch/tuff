import { describe, expect, it } from 'vitest'
import * as base from '../base/log-level'
import { LogLevel } from '../base/log-level'
import * as loggerBarrel from '../common/logger'
import * as pluginLog from '../plugin/log/types'

/**
 * One exported name must not mean two casings (#521).
 *
 * `base/log-level.ts` exports `logLevelToString` returning 'DEBUG'; `common/logger` used to export
 * a different `logLevelToString` returning 'debug'. Both are reachable as separate import paths of
 * a published package, so which one a caller got depended only on the path they typed — and
 * logger-manager persists the result into `LoggingConfig.globalLevel`, where a caller comparing
 * with `===` against a lowercase literal silently stops matching.
 *
 * The assertions are runtime rather than type-level. `pnpm typecheck:all` does cover this file, so
 * a `@ts-expect-error` guard would be checked there — but `package-utils-ci.yml`, the workflow that
 * changes to this package actually trigger, sets `run-typecheck: false` and runs only `pnpm test`.
 * A runtime check fails in both places.
 *
 * The checks are written generically — over every name the modules share — so that a future
 * same-name/different-behaviour pair is caught even though it is not this one.
 */

const ALL_LEVELS = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.NONE]

describe('casing contract', () => {
  it('logLevelToString is uppercase for every level', () => {
    for (const level of ALL_LEVELS) {
      const value = base.logLevelToString(level)
      expect(value).toBe(value.toUpperCase())
    }
    expect(base.logLevelToString(LogLevel.DEBUG)).toBe('DEBUG')
  })

  it('logLevelToLowerString is lowercase for every level', () => {
    for (const level of ALL_LEVELS) {
      const value = base.logLevelToLowerString(level)
      expect(value).toBe(value.toLowerCase())
    }
    expect(base.logLevelToLowerString(LogLevel.DEBUG)).toBe('debug')
  })

  it('the two converters disagree on every level, so the name must not be shared', () => {
    // If this ever became an equality, the collision would be harmless and this whole file moot.
    for (const level of ALL_LEVELS)
      expect(base.logLevelToString(level)).not.toBe(base.logLevelToLowerString(level))
  })

  it('stringToLogLevel round-trips both casings', () => {
    for (const level of ALL_LEVELS) {
      expect(base.stringToLogLevel(base.logLevelToString(level))).toBe(level)
      expect(base.stringToLogLevel(base.logLevelToLowerString(level))).toBe(level)
    }
  })
})

describe('no subpath re-declares a colliding name', () => {
  it('common/logger exposes the lowercase converter under its own name', () => {
    // Positive control first: if the namespace import silently resolved to {}, the `not to have`
    // assertion below would pass while checking nothing.
    expect(Object.keys(loggerBarrel).length).toBeGreaterThan(0)
    expect(loggerBarrel).toHaveProperty('getLogger')

    expect(loggerBarrel).not.toHaveProperty('logLevelToString')
    expect(loggerBarrel.logLevelToLowerString).toBe(base.logLevelToLowerString)
  })

  it('plugin/log re-exports base rather than reimplementing it', () => {
    // This subpath legitimately shares the name — because it is the same binding. Identity, not
    // equal output: a copied switch statement would pass a value comparison and then drift.
    expect(Object.keys(pluginLog).length).toBeGreaterThan(0)
    expect(pluginLog.logLevelToString).toBe(base.logLevelToString)
  })

  it('every name two of these modules share produces the same answer', () => {
    // Compared by result, not by identity. A wrapper that narrows a parameter type and delegates
    // is a different function object but the same answer, and is not the hazard; the hazard is
    // two implementations under one name that return different things.
    const probes: unknown[] = [
      ...ALL_LEVELS,
      'DEBUG',
      'debug',
      'INFO',
      'info',
      'WARN',
      'warn',
      'ERROR',
      'error',
      'NONE',
      'none'
    ]

    const describeResult = (fn: (value: unknown) => unknown, input: unknown): string => {
      try {
        return `ok:${JSON.stringify(fn(input)) ?? 'undefined'}`
      }
      catch (error) {
        return `threw:${(error as Error)?.message ?? 'unknown'}`
      }
    }

    const modules: Array<[string, Record<string, unknown>]> = [
      ['base/log-level', base as unknown as Record<string, unknown>],
      ['common/logger', loggerBarrel as unknown as Record<string, unknown>],
      ['plugin/log/types', pluginLog as unknown as Record<string, unknown>]
    ]

    const shared: string[] = []
    for (let i = 0; i < modules.length; i++) {
      for (let j = i + 1; j < modules.length; j++) {
        const [nameA, modA] = modules[i]!
        const [nameB, modB] = modules[j]!
        for (const key of Object.keys(modA)) {
          if (!(key in modB)) continue
          shared.push(key)

          const a = modA[key]
          const b = modB[key]
          if (typeof a === 'function' && typeof b === 'function') {
            for (const probe of probes) {
              expect(
                describeResult(b as (value: unknown) => unknown, probe),
                `${key}(${String(probe)}) differs between ${nameA} and ${nameB}`
              ).toBe(describeResult(a as (value: unknown) => unknown, probe))
            }
          }
          else {
            expect(b, `${key} differs between ${nameA} and ${nameB}`).toBe(a)
          }
        }
      }
    }

    // Positive control: these modules do share names (LogLevel at minimum), so an empty
    // intersection would mean the loop above asserted nothing.
    expect(shared).toContain('LogLevel')
    expect(shared).toContain('stringToLogLevel')
  })
})
