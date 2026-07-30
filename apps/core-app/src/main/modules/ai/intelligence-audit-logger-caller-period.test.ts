import type { IntelligenceAuditLogEntry } from './intelligence-audit-logger'
import { describe, expect, it } from 'vitest'
import {
  aggregateUsageStatsByCallerAndPeriod,
  sanitizeIntelligenceAuditEntry
} from './intelligence-audit-logger'
import './intelligence-test-harness'

const logs: IntelligenceAuditLogEntry[] = [
  {
    traceId: 'plugin-beta-day-success',
    timestamp: Date.parse('2026-07-02T10:00:00.000Z'),
    capabilityId: 'text.chat',
    provider: 'test-provider',
    model: 'test-model',
    caller: 'plugin:acme:beta',
    usage: { promptTokens: 10, completionTokens: 30, totalTokens: 40 },
    estimatedCost: 0.25,
    latency: 100,
    success: true
  },
  {
    traceId: 'plugin-beta-day-failure',
    timestamp: Date.parse('2026-07-02T13:00:00.000Z'),
    capabilityId: 'text.chat',
    provider: 'test-provider',
    model: 'test-model',
    caller: 'plugin:acme:beta',
    usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
    estimatedCost: 0.5,
    latency: 300,
    success: false
  },
  {
    traceId: 'plugin-beta-next-day',
    timestamp: Date.parse('2026-07-03T10:00:00.000Z'),
    capabilityId: 'text.chat',
    provider: 'test-provider',
    model: 'test-model',
    caller: 'plugin:acme:beta',
    usage: { promptTokens: 7, completionTokens: 13, totalTokens: 20 },
    estimatedCost: 0.75,
    latency: 600,
    success: true
  },
  {
    traceId: 'plugin-acme',
    timestamp: Date.parse('2026-07-02T11:00:00.000Z'),
    capabilityId: 'text.chat',
    provider: 'test-provider',
    model: 'test-model',
    caller: 'plugin:acme',
    usage: { promptTokens: 5, completionTokens: 15, totalTokens: 20 },
    estimatedCost: 0.125,
    latency: 50,
    success: true
  },
  {
    traceId: 'system',
    timestamp: Date.parse('2026-08-03T11:00:00.000Z'),
    capabilityId: 'text.chat',
    provider: 'test-provider',
    model: 'test-model',
    caller: 'system',
    usage: { promptTokens: 8, completionTokens: 12, totalTokens: 20 },
    estimatedCost: 1.25,
    latency: 80,
    success: false
  }
]

describe('usage aggregation by caller and period', () => {
  it('drops prompt, response, path, SQL, Secret, and native-error detail at audit ingress', () => {
    const sanitized = sanitizeIntelligenceAuditEntry({
      traceId: 'trace-safe',
      timestamp: Date.parse('2026-07-02T10:00:00.000Z'),
      capabilityId: 'text.chat',
      provider: 'https://CANARY_ENDPOINT',
      model: 'C:/CANARY/MODEL',
      promptHash: '0123456789abcdef',
      caller: '/CANARY/PATH',
      userId: '../CANARY_USER',
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      latency: 10,
      success: false,
      error: 'CANARY_SECRET',
      metadata: {
        promptId: 'prompt-safe',
        retryCount: 1,
        source: '/CANARY/PATH',
        promptTemplate: 'CANARY_PROMPT_TEMPLATE',
        promptVariables: { password: 'CANARY_SECRET' },
        response: 'CANARY_RESPONSE',
        sql: 'SELECT CANARY_SQL',
        path: '/CANARY/PATH'
      }
    })

    expect(sanitized).toMatchObject({
      provider: 'unknown',
      model: 'unknown',
      caller: 'unknown',
      userId: 'unknown',
      error: 'INTELLIGENCE_INVOCATION_FAILED',
      metadata: { promptId: 'prompt-safe', retryCount: 1 }
    })
    expect(JSON.stringify(sanitized)).not.toMatch(/CANARY_|password|SELECT|\/CANARY/i)
  })

  it('preserves opaque colon callers in distinct day and month buckets', () => {
    const buckets = aggregateUsageStatsByCallerAndPeriod(logs)

    expect(buckets).toHaveLength(7)
    expect(buckets).toEqual(
      expect.arrayContaining([
        {
          callerId: 'plugin:acme:beta',
          callerType: 'plugin',
          period: 'day:2026-07-02',
          periodType: 'day',
          summary: {
            period: '2026-07-02',
            periodType: 'day',
            requestCount: 2,
            successCount: 1,
            failureCount: 1,
            totalTokens: 70,
            promptTokens: 30,
            completionTokens: 40,
            totalCost: 0.75,
            avgLatency: 200
          }
        },
        {
          callerId: 'plugin:acme:beta',
          callerType: 'plugin',
          period: 'day:2026-07-03',
          periodType: 'day',
          summary: {
            period: '2026-07-03',
            periodType: 'day',
            requestCount: 1,
            successCount: 1,
            failureCount: 0,
            totalTokens: 20,
            promptTokens: 7,
            completionTokens: 13,
            totalCost: 0.75,
            avgLatency: 600
          }
        },
        {
          callerId: 'plugin:acme:beta',
          callerType: 'plugin',
          period: 'month:2026-07',
          periodType: 'month',
          summary: {
            period: '2026-07',
            periodType: 'month',
            requestCount: 3,
            successCount: 2,
            failureCount: 1,
            totalTokens: 90,
            promptTokens: 37,
            completionTokens: 53,
            totalCost: 1.5,
            avgLatency: 1000 / 3
          }
        },
        {
          callerId: 'plugin:acme',
          callerType: 'plugin',
          period: 'day:2026-07-02',
          periodType: 'day',
          summary: {
            period: '2026-07-02',
            periodType: 'day',
            requestCount: 1,
            successCount: 1,
            failureCount: 0,
            totalTokens: 20,
            promptTokens: 5,
            completionTokens: 15,
            totalCost: 0.125,
            avgLatency: 50
          }
        },
        {
          callerId: 'plugin:acme',
          callerType: 'plugin',
          period: 'month:2026-07',
          periodType: 'month',
          summary: {
            period: '2026-07',
            periodType: 'month',
            requestCount: 1,
            successCount: 1,
            failureCount: 0,
            totalTokens: 20,
            promptTokens: 5,
            completionTokens: 15,
            totalCost: 0.125,
            avgLatency: 50
          }
        },
        {
          callerId: 'system',
          callerType: 'system',
          period: 'day:2026-08-03',
          periodType: 'day',
          summary: {
            period: '2026-08-03',
            periodType: 'day',
            requestCount: 1,
            successCount: 0,
            failureCount: 1,
            totalTokens: 20,
            promptTokens: 8,
            completionTokens: 12,
            totalCost: 1.25,
            avgLatency: 80
          }
        },
        {
          callerId: 'system',
          callerType: 'system',
          period: 'month:2026-08',
          periodType: 'month',
          summary: {
            period: '2026-08',
            periodType: 'month',
            requestCount: 1,
            successCount: 0,
            failureCount: 1,
            totalTokens: 20,
            promptTokens: 8,
            completionTokens: 12,
            totalCost: 1.25,
            avgLatency: 80
          }
        }
      ])
    )

    const pluginBuckets = buckets.filter((bucket) => bucket.callerType === 'plugin')
    expect(pluginBuckets).toHaveLength(5)
    expect(new Set(pluginBuckets.map((bucket) => bucket.callerId))).toEqual(
      new Set(['plugin:acme', 'plugin:acme:beta'])
    )
  })
})
