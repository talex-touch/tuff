import { describe, expect, it } from 'vitest'
import { resolveScannedAppCreatedAt } from './app-types'

describe('resolveScannedAppCreatedAt', () => {
  it('passes through a plausible birth time', () => {
    const birthtime = new Date('2026-08-01T10:00:00.000Z')

    expect(resolveScannedAppCreatedAt({ birthtime })).toBe(birthtime)
  })

  it('drops the epoch placeholder filesystems without birth times report', () => {
    expect(resolveScannedAppCreatedAt({ birthtime: new Date(0) })).toBeUndefined()
  })

  it('drops a birth time the platform never reported', () => {
    expect(resolveScannedAppCreatedAt({})).toBeUndefined()
    expect(resolveScannedAppCreatedAt({ birthtime: null })).toBeUndefined()
    expect(resolveScannedAppCreatedAt({ birthtime: new Date(Number.NaN) })).toBeUndefined()
  })

  it('tolerates clock skew up to a day but drops anything beyond it', () => {
    const withinTolerance = new Date(Date.now() + 12 * 60 * 60 * 1000)
    const beyondTolerance = new Date(Date.now() + 25 * 60 * 60 * 1000)

    expect(resolveScannedAppCreatedAt({ birthtime: withinTolerance })).toBe(withinTolerance)
    expect(resolveScannedAppCreatedAt({ birthtime: beyondTolerance })).toBeUndefined()
  })
})
