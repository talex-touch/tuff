import { describe, expect, it } from 'vitest'
import { isBuildVerificationStatus } from '../transport/events/types/app'

describe('build verification status', () => {
  it('accepts a complete boolean verification payload', () => {
    expect(
      isBuildVerificationStatus({
        isOfficialBuild: true,
        hasOfficialKey: true,
        verificationFailed: false,
      }),
    ).toBe(true)
  })

  it.each([
    ['null', null],
    ['missing isOfficialBuild', { hasOfficialKey: true, verificationFailed: false }],
    ['missing hasOfficialKey', { isOfficialBuild: true, verificationFailed: false }],
    ['missing verificationFailed', { isOfficialBuild: true, hasOfficialKey: true }],
    [
      'non-boolean isOfficialBuild',
      { isOfficialBuild: 'true', hasOfficialKey: true, verificationFailed: false },
    ],
    [
      'non-boolean hasOfficialKey',
      { isOfficialBuild: true, hasOfficialKey: 1, verificationFailed: false },
    ],
    [
      'non-boolean verificationFailed',
      { isOfficialBuild: true, hasOfficialKey: true, verificationFailed: 'false' },
    ],
  ])('rejects %s', (_name, payload) => {
    expect(isBuildVerificationStatus(payload)).toBe(false)
  })
})
