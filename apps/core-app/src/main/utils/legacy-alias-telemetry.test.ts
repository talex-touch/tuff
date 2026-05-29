import { describe, expect, it, vi } from 'vitest'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { recordLegacyAliasHit, withLegacyAliasTelemetry } from './legacy-alias-telemetry'

describe('legacy alias telemetry', () => {
  it('records only alias metadata without payload data', () => {
    const reporter = vi.fn()
    const legacyEvent = defineRawEvent<{ token: string }, void>('terminal:create')
    const canonicalEvent = defineRawEvent<{ token: string }, void>('terminal:session:create')

    const record = recordLegacyAliasHit({
      family: 'terminal',
      legacyEvent,
      canonicalEvent,
      direction: 'renderer-to-main',
      sourceModule: 'TerminalModule',
      reporter
    })

    expect(record).toMatchObject({
      family: 'terminal',
      legacyEvent: 'terminal:create',
      canonicalEvent: 'terminal:session:create',
      direction: 'renderer-to-main',
      sourceModule: 'TerminalModule'
    })
    expect(record.timestamp).toEqual(expect.any(Number))
    expect(JSON.stringify(record)).not.toContain('token')
    expect(reporter).toHaveBeenCalledWith(record)
  })

  it('wraps legacy handlers without reporting canonical path calls', () => {
    const reporter = vi.fn()
    const handler = vi.fn((payload: { id: string }) => ({ id: payload.id }))
    const wrapped = withLegacyAliasTelemetry(handler, {
      family: 'sync',
      legacyEvent: 'sync:trigger',
      canonicalEvent: 'sync:lifecycle:trigger',
      direction: 'renderer-to-main',
      sourceModule: 'SyncModule',
      reporter
    })

    expect(handler({ id: 'canonical' })).toEqual({ id: 'canonical' })
    expect(reporter).not.toHaveBeenCalled()

    expect(wrapped({ id: 'legacy' })).toEqual({ id: 'legacy' })
    expect(reporter).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledTimes(2)
  })
})
