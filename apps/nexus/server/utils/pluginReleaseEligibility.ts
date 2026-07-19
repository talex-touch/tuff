export type PluginReleaseAudience = 'public' | 'beta' | 'owner' | 'admin'
export type PluginReleaseChannel = 'SNAPSHOT' | 'BETA' | 'RELEASE'
export type PluginReleaseEligibilityReason
  = | 'PLUGIN_ELIGIBILITY_PLUGIN_REVIEW_REQUIRED'
    | 'PLUGIN_ELIGIBILITY_VERSION_REVIEW_REQUIRED'
    | 'PLUGIN_ELIGIBILITY_CHANNEL_PRIVATE'
    | 'PLUGIN_ELIGIBILITY_ARTIFACT_MISSING'
    | 'PLUGIN_ELIGIBILITY_ARTIFACT_QUARANTINED'
    | 'PLUGIN_ELIGIBILITY_POLICY_NOT_PASSED'
    | 'PLUGIN_ELIGIBILITY_SCAN_NOT_PASSED'
    | 'PLUGIN_ELIGIBILITY_PUBLISHER_UNVERIFIED'
    | 'PLUGIN_ELIGIBILITY_ATTESTATION_UNVERIFIED'
    | 'PLUGIN_ELIGIBILITY_PUBLISHER_REVOKED'
    | 'PLUGIN_ELIGIBILITY_ADMISSION_NOT_ELIGIBLE'

export interface PluginReleaseEligibilityInput {
  pluginStatus: 'draft' | 'pending' | 'approved' | 'rejected'
  versionStatus: 'pending' | 'approved' | 'rejected'
  channel: PluginReleaseChannel
  artifactState: 'available' | 'missing' | 'quarantined'
  policyDecision: 'passed' | 'failed' | 'unavailable' | 'not-evaluated'
  scanDecision: 'passed' | 'review-required' | 'blocked' | 'unavailable' | 'not-evaluated'
  publisherTrust: 'verified' | 'failed' | 'revoked' | 'not-evaluated'
  nexusAttestation: 'verified' | 'failed' | 'not-evaluated'
  admissionDecision: 'eligible' | 'pending' | 'blocked'
  revokedAt?: string | null
  audience: PluginReleaseAudience
}

export type PluginReleaseEligibility
  = | {
    eligible: true
    visibility: 'public' | 'beta' | 'private'
    reasons: readonly []
  }
  | {
    eligible: false
    visibility: 'private'
    reasons: readonly PluginReleaseEligibilityReason[]
  }

function channelAllowed(
  channel: PluginReleaseChannel,
  audience: PluginReleaseAudience,
): boolean {
  if (audience === 'admin' || audience === 'owner')
    return true
  if (audience === 'beta')
    return channel === 'RELEASE' || channel === 'BETA'
  return channel === 'RELEASE'
}

export function evaluatePluginReleaseEligibility(
  input: PluginReleaseEligibilityInput,
): PluginReleaseEligibility {
  const reasons: PluginReleaseEligibilityReason[] = []
  if (input.pluginStatus !== 'approved')
    reasons.push('PLUGIN_ELIGIBILITY_PLUGIN_REVIEW_REQUIRED')
  if (input.versionStatus !== 'approved')
    reasons.push('PLUGIN_ELIGIBILITY_VERSION_REVIEW_REQUIRED')
  if (!channelAllowed(input.channel, input.audience))
    reasons.push('PLUGIN_ELIGIBILITY_CHANNEL_PRIVATE')
  if (input.artifactState === 'missing')
    reasons.push('PLUGIN_ELIGIBILITY_ARTIFACT_MISSING')
  else if (input.artifactState === 'quarantined')
    reasons.push('PLUGIN_ELIGIBILITY_ARTIFACT_QUARANTINED')
  if (input.policyDecision !== 'passed')
    reasons.push('PLUGIN_ELIGIBILITY_POLICY_NOT_PASSED')
  if (input.scanDecision !== 'passed' && input.scanDecision !== 'review-required')
    reasons.push('PLUGIN_ELIGIBILITY_SCAN_NOT_PASSED')
  if (input.publisherTrust !== 'verified') {
    reasons.push(input.publisherTrust === 'revoked'
      ? 'PLUGIN_ELIGIBILITY_PUBLISHER_REVOKED'
      : 'PLUGIN_ELIGIBILITY_PUBLISHER_UNVERIFIED')
  }
  if (input.nexusAttestation !== 'verified')
    reasons.push('PLUGIN_ELIGIBILITY_ATTESTATION_UNVERIFIED')
  if (input.revokedAt)
    reasons.push('PLUGIN_ELIGIBILITY_PUBLISHER_REVOKED')
  if (input.admissionDecision !== 'eligible')
    reasons.push('PLUGIN_ELIGIBILITY_ADMISSION_NOT_ELIGIBLE')

  const orderedReasons = [...new Set(reasons)]
  if (orderedReasons.length) {
    return {
      eligible: false,
      visibility: 'private',
      reasons: orderedReasons,
    }
  }
  return {
    eligible: true,
    visibility: input.audience === 'public'
      ? 'public'
      : input.audience === 'beta'
        ? 'beta'
        : 'private',
    reasons: [],
  }
}
