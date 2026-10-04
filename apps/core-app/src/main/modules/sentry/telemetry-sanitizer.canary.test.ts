/**
 * Final-sink canary tests for issue #476.
 *
 * Feeds SQL / params / POSIX+Windows path / stack / nested-cause canaries
 * through the main and renderer Sentry final sanitizers and the Nexus
 * operational-aggregate sanitizer, then asserts the serialized outbound
 * payload contains none of them.
 */
import { describe, expect, it } from 'vitest'
import {
  sanitizeNexusTelemetryEvent,
  sanitizeSentryEvent
} from '../../../main/modules/sentry/telemetry-sanitizer'
import { sanitizeCoreBoxFocusRecord } from '@talex-touch/utils/core-box/focus-telemetry'

const SQL_CANARY = 'Failed query: update "files" set "name" = ? where "files"."id" = ?'
const PARAMS_CANARY = 'params: locked.md,.md,2,3,2,4,0,file,1'
const POSIX_PATH_CANARY = '/Users/alice/Private/report.txt'
const WINDOWS_PATH_CANARY = 'C:\\Users\\alice\\Private\\report.txt'
const STACK_CANARY = 'CANARY_STACK at SqliteFileIndexPersistenceRepository.updateFileMetadata'
const CAUSE_CANARY = 'CANARY_CAUSE SQLITE_BUSY database is locked'
const MECHANISM_CANARY = 'CANARY_MECHANISM_DATA'
const TAG_CANARY = 'CANARY TAG VALUE'
const CONTEXT_CANARY = 'CANARY CONTEXT VALUE'
const SPAN_CANARY = 'CANARY_SPAN_DESCRIPTION'
const LOGENTRY_CANARY = 'CANARY_LOGENTRY_MESSAGE'
const TRANSACTION_CANARY = 'CANARY_TRANSACTION_NAME'
const FOCUS_SUMMON_CANARY = 'CANARY_FOCUS_SUMMON_SECRET'
const FOCUS_PAYLOAD_CANARY = 'CANARY_FOCUS_PAYLOAD_TOKEN'

const ALL_CANARIES = [
  SQL_CANARY,
  PARAMS_CANARY,
  POSIX_PATH_CANARY,
  WINDOWS_PATH_CANARY,
  STACK_CANARY,
  CAUSE_CANARY,
  MECHANISM_CANARY,
  TAG_CANARY,
  CONTEXT_CANARY,
  SPAN_CANARY,
  LOGENTRY_CANARY,
  TRANSACTION_CANARY,
  FOCUS_SUMMON_CANARY,
  FOCUS_PAYLOAD_CANARY
]

function expectNoCanary(payload: unknown): void {
  const serialized = JSON.stringify(payload) ?? ''
  for (const canary of ALL_CANARIES) {
    expect(serialized).not.toContain(canary)
  }
  expect(serialized).not.toContain('Failed query:')
  expect(serialized).not.toContain('params:')
  expect(serialized).not.toContain('SQLITE_BUSY')
}

function buildCanaryEvent() {
  return {
    message: `${SQL_CANARY}\n${PARAMS_CANARY}`,
    transaction: TRANSACTION_CANARY,
    request: { url: `https://example.com/?q=${encodeURIComponent(POSIX_PATH_CANARY)}` },
    breadcrumbs: [{ message: PATH_BREADCRUMB }],
    extra: { note: CAUSE_CANARY },
    modules: { 'drizzle-orm': '0.45.2' },
    server_name: 'alice-macbook',
    tags: {
      'operational.domain': 'file-index',
      'operational.code': 'FILE_INDEX_DATABASE_BUSY',
      rawNote: TAG_CANARY,
      'bad key with space': 'x'
    },
    contexts: {
      operational: {
        reportId: '11111111-2222-3333-4444-555555555555',
        occurrenceCount: 1,
        note: CONTEXT_CANARY
      },
      environment: {
        version: '2.4.14',
        buildType: 'release',
        channel: 'release',
        platform: 'darwin'
      },
      trace: { description: CONTEXT_CANARY },
      device: { name: 'Alice MacBook' }
    },
    spans: [{ description: SPAN_CANARY, op: 'db.query' }],
    logentry: { message: LOGENTRY_CANARY },
    exception: {
      values: [
        {
          type: 'DrizzleQueryError',
          value: `${SQL_CANARY}\n${PARAMS_CANARY}`,
          module: 'drizzle-orm.errors',
          mechanism: {
            type: 'generic',
            handled: false,
            data: { note: MECHANISM_CANARY }
          },
          stacktrace: {
            frames: [
              {
                filename: `${POSIX_PATH_CANARY}.ts`,
                abs_path: `${WINDOWS_PATH_CANARY}.ts`,
                context_line: `// ${STACK_CANARY}`,
                pre_context: ['// secret'],
                post_context: ['// secret'],
                vars: { sql: SQL_CANARY },
                function: 'updateFileMetadata'
              },
              {
                filename: 'worker.ts',
                function: 'handleMessage'
              }
            ]
          }
        },
        {
          type: 'LibsqlError',
          value: CAUSE_CANARY,
          mechanism: { type: 'cause', handled: true, data: { cause: CAUSE_CANARY } },
          stacktrace: {
            frames: [
              {
                filename: 'sqlite3.js',
                abs_path: '/Users/alice/app/node_modules/sqlite3.js',
                context_line: 'throw new LibsqlError()',
                vars: { params: PARAMS_CANARY },
                function: 'execute'
              }
            ]
          }
        }
      ]
    }
  } as never
}

const PATH_BREADCRUMB = `${POSIX_PATH_CANARY} opened`


describe('main Sentry final sanitizer canary (issue #476)', () => {
  it('strips every canary from the serialized final event while keeping stable classification', () => {
    const sanitized = sanitizeSentryEvent(buildCanaryEvent())
    const event = sanitized as unknown as Record<string, unknown> & {
      tags?: Record<string, string>
      contexts?: Record<string, Record<string, unknown>>
      exception?: {
        values?: Array<{
          value?: string
          module?: string
          mechanism?: unknown
          stacktrace?: { frames?: Array<Record<string, unknown>> }
        }>
      }
    }

    expectNoCanary(sanitized)

    expect(event.request).toBeUndefined()
    expect(event.breadcrumbs).toBeUndefined()
    expect(event.extra).toBeUndefined()
    expect(event.modules).toBeUndefined()
    expect(event.server_name).toBeUndefined()
    expect(event.transaction).toBeUndefined()
    expect(event.spans).toBeUndefined()
    expect(event.logentry).toBeUndefined()
    expect(event.message).toBe('redacted')

    expect(event.tags).toEqual({
      'operational.domain': 'file-index',
      'operational.code': 'FILE_INDEX_DATABASE_BUSY'
    })

    expect(Object.keys(event.contexts ?? {}).sort()).toEqual(['environment', 'operational'])
    expect(event.contexts?.operational).toEqual({
      reportId: '11111111-2222-3333-4444-555555555555',
      occurrenceCount: 1
    })

    const values = event.exception?.values ?? []
    expect(values).toHaveLength(2)
    for (const value of values) {
      expect(value.value).toBe('redacted')
      expect(value.module).toBeUndefined()
      expect(value.mechanism).toBeUndefined()
      for (const frame of value.stacktrace?.frames ?? []) {
        expect(frame.filename).toBeUndefined()
        expect(frame.abs_path).toBeUndefined()
        expect(frame.context_line).toBeUndefined()
        expect(frame.pre_context).toBeUndefined()
        expect(frame.post_context).toBeUndefined()
        expect(frame.vars).toBeUndefined()
      }
    }
    expect(values[0].stacktrace?.frames?.[0]).toEqual({ function: 'updateFileMetadata' })
    expect(values[0].stacktrace?.frames?.[1]).toEqual({
      function: 'handleMessage'
    })
  })
})

describe('renderer Sentry final sanitizer canary (issue #476)', () => {
  it('strips every canary from the serialized final renderer event', async () => {
    const { sanitizeRendererSentryEvent } =
      await import('../../../renderer/src/modules/sentry/sentry-renderer-sanitizer')
    const sanitized = sanitizeRendererSentryEvent(buildCanaryEvent())
    const event = sanitized as unknown as Record<string, unknown> & {
      tags?: Record<string, string>
      contexts?: Record<string, Record<string, unknown>>
      exception?: { values?: Array<{ value?: string; mechanism?: unknown }> }
    }

    expectNoCanary(sanitized)
    expect(event.transaction).toBeUndefined()
    expect(event.spans).toBeUndefined()
    expect(event.logentry).toBeUndefined()
    expect(event.tags?.rawNote).toBeUndefined()
    expect(event.tags?.['operational.code']).toBe('FILE_INDEX_DATABASE_BUSY')
    expect(Object.keys(event.contexts ?? {}).sort()).toEqual(['environment', 'operational'])
    for (const value of event.exception?.values ?? []) {
      expect(value.value).toBe('redacted')
      expect(value.mechanism).toBeUndefined()
    }
  })
})

describe('Nexus operational aggregate final payload canary (issue #476)', () => {
  it('keeps only allowlisted stable primitives in the operational error event', () => {
    const sanitized = sanitizeNexusTelemetryEvent({
      eventType: 'error',
      clientId: 'client-1',
      platform: 'darwin',
      version: '2.4.14',
      isAnonymous: true,
      metadata: {
        kind: 'operational-error',
        domain: 'file-index',
        operation: 'transport.status',
        code: 'FILE_INDEX_DATABASE_BUSY',
        severity: 'error',
        userImpact: 'degraded',
        retryable: true,
        occurrenceCount: 3,
        rawCode: 5,
        sql: SQL_CANARY,
        params: PARAMS_CANARY,
        path: POSIX_PATH_CANARY,
        stack: STACK_CANARY,
        note: CONTEXT_CANARY,
        nested: { cause: CAUSE_CANARY }
      } as Record<string, unknown>
    })

    expectNoCanary(sanitized)
    expect(sanitized?.metadata).toEqual({
      kind: 'operational-error',
      domain: 'file-index',
      operation: 'transport.status',
      code: 'FILE_INDEX_DATABASE_BUSY',
      severity: 'error',
      userImpact: 'degraded',
      retryable: true,
      occurrenceCount: 3,
      rawCode: 5
    })
  })
})

describe('CoreBox focus telemetry canary (issue #476)', () => {
  it('strict-validates corebox-focus records and rejects PII-bearing fields', () => {
    const record = {
      kind: 'corebox-focus',
      summonId: FOCUS_SUMMON_CANARY,
      sampleIndex: 1,
      triggerSource: 'shortcut',
      stage: 'sample',
      status: 'success',
      severity: 'info',
      code: 'COREBOX_FOCUS_OK',
      elapsedMs: 42,
      plannedSampleCount: 10,
      documentFocused: true,
      inputPresent: true,
      inputFocused: true,
      expectedTarget: 'input',
      expectedTargetPresent: true,
      expectedTargetFocused: true,
      windowAlive: true,
      visible: true,
      windowFocused: false,
      webContentsFocused: false,
      pluginActive: false,
      pluginFocused: false,
      metaVisible: false,
      metaFocused: false,
      note: FOCUS_PAYLOAD_CANARY
    }

    // Non-UUID summonId fails strict validation
    expect(sanitizeCoreBoxFocusRecord(record)).toBeNull()

    // With a valid UUID, PII fields are dropped but safe primitives survive
    const valid = sanitizeCoreBoxFocusRecord({
      ...record,
      summonId: '123e4567-e89b-42d3-a456-426614174000'
    })
    expectNoCanary(valid)
    expect(valid).toMatchObject({
      kind: 'corebox-focus',
      summonId: '123e4567-e89b-42d3-a456-426614174000',
      sampleIndex: 1,
      stage: 'sample',
      status: 'success',
      code: 'COREBOX_FOCUS_OK',
      elapsedMs: 42,
      plannedSampleCount: 10,
      triggerSource: 'shortcut',
      documentFocused: true,
      inputPresent: true,
      inputFocused: true,
      expectedTarget: 'input',
      expectedTargetPresent: true,
      expectedTargetFocused: true
    })
    // False booleans are preserved as real native state
    expect(valid?.windowFocused).toBe(false)
    expect(valid?.webContentsFocused).toBe(false)
    expect(valid?.pluginActive).toBe(false)
    expect(valid?.metaVisible).toBe(false)
    // Unknown PII deleted
    expect(valid).not.toHaveProperty('note')
  })


})
