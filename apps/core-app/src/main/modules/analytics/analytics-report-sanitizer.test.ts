import type { AnalyticsMessage } from '@talex-touch/utils/analytics'
import { describe, expect, it } from 'vitest'
import {
  sanitizeAnalyticsReportMessage,
  sanitizePluginAnalyticsIdentifier,
  sanitizePluginAnalyticsMetadata,
  sanitizePluginAnalyticsNumber
} from './analytics-report-sanitizer'

describe('analytics remote message projection', () => {
  it('keeps bounded operational metadata without content-bearing fields', () => {
    const source: AnalyticsMessage = {
      id: 'event-safe',
      source: 'system',
      severity: 'error',
      title: 'CANARY_TITLE',
      message: 'CANARY_MESSAGE path=/private sql=SELECT secret',
      meta: { password: 'CANARY_SECRET', stack: 'CANARY_STACK' },
      status: 'unread',
      createdAt: 1
    }

    const sanitized = sanitizeAnalyticsReportMessage(source)
    expect(sanitized).toEqual({
      id: 'event-safe',
      source: 'system',
      severity: 'error',
      title: 'Diagnostic event',
      message: '',
      status: 'unread',
      createdAt: 1
    })
    expect(JSON.stringify(sanitized)).not.toMatch(/CANARY_|password|stack|SELECT|\/private/i)
  })

  it('bounds plugin analytics identifiers, values, and persisted metadata', () => {
    expect(sanitizePluginAnalyticsIdentifier('__proto__')).toBe('redacted')
    expect(sanitizePluginAnalyticsIdentifier('CANARY_SECRET/path')).toBe('redacted')
    expect(sanitizePluginAnalyticsNumber(Number.NaN)).toBe(0)
    expect(sanitizePluginAnalyticsNumber(Number.POSITIVE_INFINITY)).toBe(0)

    const metadata = sanitizePluginAnalyticsMetadata({
      name: 'safe.counter',
      value: 3,
      password: 'CANARY_SECRET',
      stack: '/private/CANARY_STACK'
    })
    expect(metadata).toEqual({ name: 'safe.counter', value: 3 })
    expect(JSON.stringify(metadata)).not.toMatch(/CANARY_|password|stack|\/private/i)
  })
})
