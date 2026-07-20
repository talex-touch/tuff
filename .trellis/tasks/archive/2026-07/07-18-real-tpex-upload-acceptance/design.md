# Real TPEX Upload Acceptance - Design

## Acceptance Topology

```text
canonical source
  -> local clean build/audit
  -> tuff publish (real HTTP)
  -> deployed Nexus worker
  -> D1 version/timeline + R2 object
  -> Store eligibility/download
  -> isolated CoreApp TPEX install
  -> strict evidence verifier
```

Every arrow is observed through identifiers and digests, not inferred from a success toast.

## Environment Contract

A run configuration declares:

- Nexus base URL and environment label;
- expected storage mode (`d1+r2` or documented deployed equivalent);
- test plugin slug/id/version/channel;
- cleanup policy;
- credential environment-variable names, never values;
- isolated CoreApp profile path held outside committed evidence.

Default channel is BETA on a deployed preview/staging environment. Production RELEASE requires explicit operator approval at execution time.

## Run Phases

1. Preflight environment health, auth scopes and no memory fallback.
2. Build unique SemVer from clean source and capture build audit/digest.
3. Run strict validate, policy, scan, signature and publish dry-run.
4. Execute one non-dry-run CLI publish and capture bounded response metadata.
5. Query authorized Dashboard/version/timeline state and storage diagnostics.
6. Confirm pre-review public denial; apply the environment-approved review action.
7. Confirm expected channel visibility, download bytes and digest.
8. Install through CoreApp official TPEX provider in an isolated profile and exercise one declared feature.
9. Apply cleanup/retention policy and verify no orphan state.

## Evidence Capture

The collector writes a sanitized JSON event per phase with timestamp, request id, plugin/version/object ids, status and artifact digest. HTTP bodies are projected through explicit allowlists. Authorization headers, cookies, tokens, user data and complete logs are never stored.

## Idempotency

The acceptance version is unique. Repeating the exact version/channel must fail without a second object/row. A retry after transport ambiguity first resolves the existing version by identity before attempting another write.

## Failure and Cleanup

Any failed phase marks the run blocked/failed and still checks for orphan D1 rows/R2 objects. Cleanup uses supported API/admin flows and records deletion timeline/object confirmation. Direct database/object deletion is not the normal path.
