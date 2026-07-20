# Nexus Plugin Display Gate - Design

## Eligibility Projection

Create one pure projection used by every public Store surface:

```ts
interface PluginReleaseEligibilityInput {
  pluginStatus: PluginStatus
  versionStatus: PluginVersionStatus
  channel: PluginChannel
  artifactState: 'available' | 'missing' | 'quarantined'
  policyDecision: AdmissionDecision
  scanDecision: ScanDecision
  publisherTrust: TrustDecision
  nexusAttestation: TrustDecision
  revokedAt?: string | null
  audience: 'public' | 'beta' | 'owner' | 'admin'
}

type PluginReleaseEligibility =
  | { eligible: true; visibility: 'public' | 'beta' | 'private' }
  | { eligible: false; reasons: readonly EligibilityReason[] }
```

Reason codes are stable and ordered. UI text maps them separately.

## Storage Model

Extend version persistence with references/statuses, not embedded reports:

- artifact digest/state
- policy version/decision/report digest
- scan version/decision/report digest
- publisher key/signature decision
- Nexus attestation id/decision
- eligibility revision/evaluatedAt
- revocation marker

D1 migration and memory fallback use the same domain type and defaults. Existing rows hydrate as `unknown/not-evaluated`, never eligible by accident.

## Endpoint Integration

- Store list/search first filter versions through eligibility, then omit plugins with no eligible version.
- Store detail and versions return only audience-eligible versions.
- Download re-evaluates the exact version immediately before object retrieval.
- Dashboard owner/admin paths return all authorized versions plus safe eligibility reasons.
- Status/scan/signature/artifact transitions recompute latest eligible version and append timeline events.

## Channel Rules

- Public audience: approved eligible `RELEASE` only.
- Explicit beta audience: approved eligible `RELEASE` and `BETA`.
- Owner/admin: authorized pending/rejected/SNAPSHOT visibility, but download still respects quarantine/revocation policy.

Latest selection compares eligible channel then semantic version and creation tie-breaker. A new ineligible version never replaces the previous eligible latest pointer.

## Cache and Revocation

Eligibility is derived from persisted state and revisioned. Public caches include eligibility revision and are purged on artifact, policy, scan, signature, review or revocation transitions. Download never trusts a stale list-cache decision.

## Rollout/Rollback

Legacy rows are backfilled only to explicit `not-evaluated`/ineligible state; cryptographic trust is never manufactured for old artifacts, which require canonical republish. The hard cut applies to all public endpoints together. Rollback may restore prior projection code, but revoked/quarantined artifacts remain blocked.
