import type { PluginReleaseEligibilityInput } from './pluginReleaseEligibility'
import { describe, expect, it } from 'vitest'
import { evaluatePluginReleaseEligibility } from './pluginReleaseEligibility'

function eligibleInput(overrides: Partial<PluginReleaseEligibilityInput> = {}): PluginReleaseEligibilityInput {
  return {
    pluginStatus: 'approved',
    versionStatus: 'approved',
    channel: 'RELEASE',
    artifactState: 'available',
    policyDecision: 'passed',
    scanDecision: 'passed',
    publisherTrust: 'verified',
    nexusAttestation: 'verified',
    admissionDecision: 'eligible',
    revokedAt: null,
    audience: 'public',
    ...overrides,
  }
}

describe('evaluatePluginReleaseEligibility', () => {
  it('returns stable, de-duplicated reasons in evaluation order', () => {
    expect(evaluatePluginReleaseEligibility(eligibleInput({
      pluginStatus: 'pending',
      versionStatus: 'rejected',
      channel: 'BETA',
      artifactState: 'quarantined',
      policyDecision: 'failed',
      scanDecision: 'blocked',
      publisherTrust: 'revoked',
      nexusAttestation: 'failed',
      admissionDecision: 'blocked',
      revokedAt: '2026-07-18T00:00:00.000Z',
    }))).toEqual({
      eligible: false,
      visibility: 'private',
      reasons: [
        'PLUGIN_ELIGIBILITY_PLUGIN_REVIEW_REQUIRED',
        'PLUGIN_ELIGIBILITY_VERSION_REVIEW_REQUIRED',
        'PLUGIN_ELIGIBILITY_CHANNEL_PRIVATE',
        'PLUGIN_ELIGIBILITY_ARTIFACT_QUARANTINED',
        'PLUGIN_ELIGIBILITY_POLICY_NOT_PASSED',
        'PLUGIN_ELIGIBILITY_SCAN_NOT_PASSED',
        'PLUGIN_ELIGIBILITY_PUBLISHER_REVOKED',
        'PLUGIN_ELIGIBILITY_ATTESTATION_UNVERIFIED',
        'PLUGIN_ELIGIBILITY_ADMISSION_NOT_ELIGIBLE',
      ],
    })
  })

  it.each([
    { audience: 'public', channel: 'RELEASE', eligible: true, visibility: 'public' },
    { audience: 'public', channel: 'BETA', eligible: false, visibility: 'private' },
    { audience: 'public', channel: 'SNAPSHOT', eligible: false, visibility: 'private' },
    { audience: 'beta', channel: 'RELEASE', eligible: true, visibility: 'beta' },
    { audience: 'beta', channel: 'BETA', eligible: true, visibility: 'beta' },
    { audience: 'beta', channel: 'SNAPSHOT', eligible: false, visibility: 'private' },
    { audience: 'owner', channel: 'SNAPSHOT', eligible: true, visibility: 'private' },
    { audience: 'admin', channel: 'SNAPSHOT', eligible: true, visibility: 'private' },
  ] as const)('projects $channel for the $audience audience', ({ audience, channel, eligible, visibility }) => {
    const result = evaluatePluginReleaseEligibility(eligibleInput({ audience, channel }))

    expect(result.eligible).toBe(eligible)
    expect(result.visibility).toBe(visibility)
    if (!eligible)
      expect(result.reasons).toEqual(['PLUGIN_ELIGIBILITY_CHANNEL_PRIVATE'])
  })

  it.each([
    { name: 'missing policy', policyDecision: 'not-evaluated' as const },
    { name: 'missing scan', scanDecision: 'not-evaluated' as const },
    { name: 'missing publisher verification', publisherTrust: 'not-evaluated' as const },
    { name: 'missing Nexus attestation', nexusAttestation: 'not-evaluated' as const },
    { name: 'pending admission', admissionDecision: 'pending' as const },
  ])('fails closed for $name regardless of audience', (overrides) => {
    for (const audience of ['public', 'beta', 'owner', 'admin'] as const) {
      const result = evaluatePluginReleaseEligibility(eligibleInput({ ...overrides, audience }))
      expect(result.eligible).toBe(false)
      expect(result.visibility).toBe('private')
      expect(result.reasons).not.toHaveLength(0)
    }
  })
})
