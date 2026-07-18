# Plugin Release Evidence - Design

## Artifact Set

A curated report directory contains:

- `plugin-release-evidence-manifest.json` — source of truth;
- `PLUGIN_RELEASE_EVIDENCE_CHECKLIST.md` — human review mapped to manifest ids;
- `README.md` — bounded summary, environment and limitations;
- `plugin-release-strict-output.json` and exit-code capture;
- accepted bounded JSON/screenshots required by the manifest.

Raw logs, HAR, profiles and exploratory captures live under ignored `raw/` or `_local/`.

## Manifest Model

```ts
interface PluginReleaseEvidenceManifestV1 {
  contractVersion: 1
  environment: { kind: 'local' | 'preview' | 'production'; storage: string }
  source: { revision: string; dirty: boolean }
  plugin: { id: string; name: string; version: string; channel: string }
  artifact: { sha256: string; size: number; pathRef: string }
  records: EvidenceRecord[]
  gate: { passed: boolean; failures: string[]; checkedAt: string }
}
```

Each record declares id, level, status, timestamps, upstream ids/digests and artifact references. Required records cover build audit, policy, scan, publisher signature, Nexus attestation, upload persistence, eligibility, download and CoreApp install.

## Strict Verifier

The verifier:

1. validates schema/enums/status transitions;
2. checks required records and minimum evidence levels;
3. resolves only report-relative paths and verifies referenced files;
4. recomputes digests for local accepted artifacts;
5. asserts identity/version/channel/artifact digest equality across records;
6. validates chronological dependency order;
7. scans all manifest strings for credentials, private keys and absolute user paths;
8. emits deterministic sorted failures and nonzero exit on any mismatch.

It never performs production mutations; collection and verification are separate.

## Evidence Levels

- `focused`: unit/integration command output.
- `controlled`: local fixture or mock service.
- `packaged`: real package/CoreApp artifact in isolated local profile.
- `deployed`: real remote service path with declared backend.
- `real-upload`: non-dry-run upload + persistent object/row + redownload.

Acceptance specifies the minimum level per record. Higher levels may satisfy lower-level prerequisites, never the reverse.

## Hygiene and Retention

Safe projections use allowlisted fields. Request headers/bodies and raw process logs are not evidence artifacts. Historical reports are immutable snapshots; a later rerun creates a new dated/versioned report instead of rewriting an old pass.
