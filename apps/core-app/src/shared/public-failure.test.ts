import { describe, expect, it, vi } from 'vitest'
import { describePublicFailure, PublicFailure } from './public-failure'

describe('describePublicFailure', () => {
  it('translates known public failure sentences via the provided translator', () => {
    const t = vi.fn((key: string) => `localized:${key}`)

    expect(describePublicFailure(PublicFailure.OperationFailed, t)).toBe(
      'localized:common.failures.operationFailed'
    )
    expect(describePublicFailure(`  ${PublicFailure.DatabaseBusy}  `, t)).toBe(
      'localized:common.failures.databaseBusy'
    )
    expect(describePublicFailure(PublicFailure.IndexWriterBusy, t)).toBe(
      'localized:common.failures.indexWriterBusy'
    )
  })

  it('returns Object.prototype property names verbatim without invoking the translator', () => {
    const t = vi.fn((key: string) => `localized:${key}`)

    for (const protoKey of ['toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty']) {
      expect(describePublicFailure(protoKey, t)).toBe(protoKey)
    }
    expect(t).not.toHaveBeenCalled()
  })
})
