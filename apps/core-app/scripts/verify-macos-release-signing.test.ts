import { describe, expect, it } from 'vitest'
import { aggregateMacosReleaseSigningEvidence } from './verify-macos-release-signing.mjs'

type SigningCheck = 'codesign' | 'gatekeeper' | 'notarization'

type SigningEvidence = {
  appBundle: string
  status: 'pass' | 'fail'
  signingKind: 'developer-id' | 'ad-hoc-or-missing'
  teamIdentifier: string | null
  authorities: string[]
  checks: Record<SigningCheck, boolean>
  failures: string[]
}

function createEvidence(
  overrides: Partial<SigningEvidence> & Pick<SigningEvidence, 'appBundle'>
): SigningEvidence {
  return {
    appBundle: overrides.appBundle,
    status: 'pass',
    signingKind: 'developer-id',
    teamIdentifier: '7H3M4T34M',
    authorities: [
      'Developer ID Application: Talex Touch (7H3M4T34M)',
      'Developer ID Certification Authority',
      'Apple Root CA'
    ],
    checks: {
      codesign: true,
      gatekeeper: true,
      notarization: true
    },
    failures: [],
    ...overrides
  }
}

describe('aggregateMacosReleaseSigningEvidence', () => {
  it('passes only after preserving successful arm64 and x64 bundle evidence', () => {
    const evidences = [
      createEvidence({ appBundle: 'Talex Touch-arm64.app' }),
      createEvidence({ appBundle: 'Talex Touch-x64.app' })
    ]

    const result = aggregateMacosReleaseSigningEvidence(evidences)

    expect(result.status).toBe('pass')
    expect(result.appBundles).toEqual(evidences)
  })

  it.each<SigningCheck>(['codesign', 'gatekeeper', 'notarization'])(
    'fails the full release when one bundle fails %s and identifies that bundle',
    (failedCheck) => {
      const failedBundle = `Talex Touch-arm64-${failedCheck}.app`
      const evidences = [
        createEvidence({
          appBundle: failedBundle,
          checks: {
            codesign: failedCheck !== 'codesign',
            gatekeeper: failedCheck !== 'gatekeeper',
            notarization: failedCheck !== 'notarization'
          },
          failures: [failedCheck]
        }),
        createEvidence({ appBundle: 'Talex Touch-x64.app' })
      ]

      const result = aggregateMacosReleaseSigningEvidence(evidences)

      expect(result.status).toBe('fail')
      expect(result.appBundles).toEqual(evidences)
      expect(JSON.stringify(result.failures)).toContain(failedBundle)
      expect(JSON.stringify(result.failures)).toContain(failedCheck)
    }
  )

  it.each([
    {
      name: 'the architecture bundles have different TeamIdentifier values',
      evidences: [
        createEvidence({
          appBundle: 'Talex Touch-arm64.app',
          teamIdentifier: '7H3M4T34M'
        }),
        createEvidence({
          appBundle: 'Talex Touch-x64.app',
          teamIdentifier: '8J4N5U45N'
        })
      ],
      affectedBundles: ['Talex Touch-arm64.app', 'Talex Touch-x64.app']
    },
    {
      name: 'one architecture bundle has no TeamIdentifier',
      evidences: [
        createEvidence({
          appBundle: 'Talex Touch-arm64.app',
          teamIdentifier: null
        }),
        createEvidence({ appBundle: 'Talex Touch-x64.app' })
      ],
      affectedBundles: ['Talex Touch-arm64.app']
    }
  ])('fails when $name', ({ evidences, affectedBundles }) => {
    const result = aggregateMacosReleaseSigningEvidence(evidences)

    expect(result.status).toBe('fail')
    expect(result.appBundles).toEqual(evidences)
    for (const appBundle of affectedBundles)
      expect(JSON.stringify(result.failures)).toContain(appBundle)
  })
})
