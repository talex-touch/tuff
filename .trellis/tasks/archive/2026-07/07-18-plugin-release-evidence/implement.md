# Plugin Release Evidence - Implementation Plan

## Ordered Checklist

1. [x] Define evidence manifest/record/status/level schema and stable required record ids.
2. [x] Implement strict verifier with schema, path, digest, identity, chronology, level and sensitive-string checks.
3. [x] Add negative fixtures for missing real-upload records, digest mismatch, stale version, invalid level, missing files and secret/absolute-path leakage.
4. [x] Add safe collectors/projections for build audit, policy, scan, publisher signature, Nexus attestation, upload/storage, eligibility/download and CoreApp install.
5. [x] Create report template/checklist that maps each parent/child acceptance criterion to record ids and artifact refs.
6. [x] Run focused/controlled verification first; keep unsatisfied deployed/real-upload items blocked.
7. [x] Consume the completed real upload run and bind all records to one artifact SHA-256.
8. [x] Produce strict output/exit capture, bounded README and hygiene review.
9. [x] Re-run strict verifier from a clean report-relative artifact set.

## Contract Tests

- deterministic failure ordering;
- report-relative path containment and missing path;
- JSON parse/schema failure;
- identity/version/channel/digest cross-record mismatch;
- chronology/dependency inversion;
- focused evidence attempting to satisfy real-upload requirement;
- token/cookie/private key/absolute user path/full-log rejection;
- valid complete manifest exits 0.

## Verification Commands

```bash
node --test scripts/plugin-release-evidence.test.mjs
node scripts/plugin-release-evidence.mjs "$REPORT_DIR/plugin-release-evidence-manifest.json" --strict
# Parse every committed JSON artifact
# Confirm report hygiene inventory contains only declared files
git diff --check
```

Replace placeholders with actual script paths before task completion.

## Risky Files

- Evidence verifier and manifest schema: avoid permissive unknown fields for security-sensitive records.
- Curated report directory: no raw logs/profiles/HAR.
- Environment labeling: memory/local cannot be represented as deployed/real-upload.
- Historical reports are immutable snapshots.

## Rollback

Verifier/schema changes are versioned. A new schema failure does not rewrite old evidence; keep the prior verifier for historical manifests and create a new report for the new contract. Never downgrade a failed/blocked record to pass during rollback.
