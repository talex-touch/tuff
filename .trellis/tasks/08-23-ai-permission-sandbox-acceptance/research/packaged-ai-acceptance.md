# Packaged AI Acceptance Evidence

## Scope And Provenance

- Evidence date: 2026-08-26.
- Tested bundle version: `2.4.14-beta.14`.
- Physical `app.asar` SHA-256:
  `86cbb6b9f1da612aa7de30c46f4b153f33a69914e9fcb078d74f5de891186963`.
- Architecture: arm64.
- Trust classification: local behavior-only package. The executable is linker
  ad-hoc signed, has no Team ID, and fails deep strict codesign and Gatekeeper.
  It is not release or distribution evidence.
- The tested `app.asar` was built after the packaged NetworkService stream
  deadline, Pi cancellation/teardown, and breadcrumb-redaction changes. Failure
  Matrix query recovery is repository-side acceptance-runner logic: the failed
  and passing reports exercised an unchanged `app.asar` with different runner
  logic. Tool, Provider, and failure-matrix reports all record this version and
  physical hash.
- The reports bind `Contents/Resources/app.asar`, not the complete `.app`
  bundle. The executable, `app.asar.unpacked`, Pi extension, and bundled-plugin
  extra resources are outside this hash and are not claimed as identical by
  this evidence set.
- The hash-specific `86cbb6b9` artifacts named below are authoritative for this
  run. Older top-level canonical evidence files remain historical and must not
  be combined with this evidence set.

## Tool Confirmation

The retained report for a fresh isolated-profile run passed all six controlled
scenarios: deny, allow, remember/replay, reset, timeout, and cancel. The
confirmation timeout used the report's explicit `controlled-override` mode.
Each
scenario observed one confirmation card where required, a correlated
call/decision/result audit, the stable expected result code, cleared UI state,
and a completed request. The runner terminated its owned process and removed
its generated profile. Cancel audit settlement took 64 ms against the 1,500 ms
bound.

The raw runner report and its six redacted card screenshots are retained under
`evidence/tool-confirmation-rerun-86cbb6b9-20260826/`.

### Earlier Non-Retained Flaky Observation

This pass does not erase an earlier first-profile failure observed in a run
whose raw report was not retained. On the preceding physical `app.asar` hash
`5797c3e0275d22a53fdd5e78f124c28272ca3f3c32d053d71c7b841ef305ee54`,
the first fresh profile produced `FIXTURE_INVOCATION_NOT_STARTED` for five
scenarios and `RESET_APPROVALS_UNAVAILABLE` for reset; a second fresh profile
then passed all six scenarios. The failure was consistent with the Home surface
falling back before the controlled Pi fixture became active. Later package
hashes passed their first fresh runs, but the original race has no isolated root
cause or targeted fix, so it remains a residual flaky risk.

## Real Provider And Secure Store

The packaged Provider runner used the isolated loopback Ollama endpoint and
`smollm2:135m`. It completed three launches and proved:

- credential save through UI, exact secure-store recovery after relaunch, and
  deletion through UI;
- two user-visible Home streams with busy deltas plus stable title requests;
- cancellation after a busy delta, with no cancelled Home audit and exactly one
  accounted background title request;
- four unique successful audit rows and matching day/month usage deltas;
- 234 prompt tokens, 64 completion tokens, 298 total tokens, and cost
  `0.000362` in both audit and usage;
- secure-store envelope validity, deleted credential key, absent credential
  canary, owned process cleanup, and profile removal.

The passing report is
`evidence/provider-rerun-86cbb6b9-20260826.json`.

The credential canary scan traverses every non-symlink regular file under the
isolated profile with a 20,000-file and 256 MiB fail-closed bound, both while
the credential is encrypted at rest and after UI deletion. This traversal has
no Sentry exclusion, so it covers `sentry/scope_v3.json` when that file exists.
The report records the aggregate `credentialCanaryAbsent` result; it does not
claim that a particular Sentry file was created during this run.

## Failure Matrix And Timeout Closure

The same physical `app.asar` hash passed all five fixed AI failure scenarios:
no Provider, exhausted quota, unsupported model, permission denial, and
post-delta network timeout. Together with the real Provider cancellation above,
this closes the six required failure paths from a user-visible Home entry. Every
scenario used a fresh isolated profile and cleaned up its process, profile, and
loopback fixture. The passing report is
`evidence/failure-matrix-rerun-86cbb6b9-20260826/packaged-ai-failure-matrix.json`.

The timeout fixture received exactly one request, returned headers and a partial
delta, then kept the body open. The packaged UI settled to `NETWORK_FAILURE`;
audit, day usage, and month usage each gained exactly one failure and no success,
token, or cost delta.

### Timeout Debug Retrospective

- **Root cause categories**: D (test coverage gap) and E (implicit assumption).
  Existing tests covered timeout before response headers but implicitly treated
  `fetch()` resolution as request completion, leaving the streamed body
  ungoverned after a partial delta.
- **Why earlier gates missed it**: unit and synthetic fixtures completed or
  failed their bodies. Only the packaged post-delta hang distinguished a header
  timeout from a request-lifetime deadline.
- **Prevention**: `requestStream()` now uses one absolute deadline from fetch
  start through body EOF, destroys a stalled body with `NetworkTimeoutError`,
  and clears its timer on `end`, `error`, or `close`.
- **Systematic expansion**: any future streaming adapter must distinguish
  headers, partial progress, EOF, native error, and consumer destruction rather
  than using `fetch()` resolution as its terminal boundary.
- **Knowledge capture**: focused regression tests and
  `.trellis/spec/main-process/background-task-timeout-contracts.md` encode the
  executable deadline and settlement contract.

### Failure Matrix Runner Query Refresh Debug Retrospective

#### 1. Root Cause Category

- **Category**: D (test coverage gap) and E (implicit assumption).
- **Specific cause**: the external Failure Matrix acceptance runner's refresh
  branch required an already accepted search observation before it could retry.
  A missing or invalid first observation therefore could not satisfy its own
  recovery precondition and eventually failed as
  `INTELLIGENCE_WIDGET_NOT_READY`.

#### 2. Why Fixes Failed

1. The initial stale-query recovery covered an accepted result with an empty
   candidate set, but not the earlier state where no post-baseline observation
   had ever become valid.
2. Unit coverage exercised stale candidates and stable identity transitions;
   only the packaged `no-provider` and `permission-denied` scenarios supplied
   the discriminating missing-observation state.

#### 3. Prevention Mechanisms

| Priority | Mechanism         | Specific action                                                                                                  | Status |
| -------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- | ------ |
| P0       | Acceptance runner | Treat either an unaccepted observation or an incomplete candidate set as refreshable before activation           | DONE   |
| P0       | Test coverage     | Keep a regression where the first query never produces an accepted observation and the refreshed query recovers  | DONE   |
| P1       | Evidence          | Preserve the same-hash failed report beside the passing rerun so harness recovery is not inferred from exit code | DONE   |

#### 4. Systematic Expansion

- **Similar issues**: any packaged UI driver whose retry gate depends on the
  state it is intended to recover can deadlock on missing first telemetry.
- **Design improvement**: driver-side recovery is permitted only before feature
  activation; request/session/revision identity and consecutive
  candidate/readiness samples still prevent a stale or duplicate click.
- **Process improvement**: packaged acceptance failures must be reduced into a
  deterministic driver test, then proved red-to-green against the unchanged
  `app.asar` hash when the fix is runner-only.

#### 5. Knowledge Capture

- [x] Added the runner missing-observation regression and retained the stable
      identity and single-activation assertions.
- [x] Preserved the failed report as
      `evidence/failure-matrix-rerun-b5b9ef73-20260826/failed-before-query-refresh.json`.
- [x] Added the same-hash and bounded canary evidence contract to
      `.trellis/spec/frontend/privacy-data-lifecycle.md`.

## Curated Evidence-Set Verification

The hardened verifier bound the physical bundle, executable, stable
`app.asar` hash, three exact-schema reports, and six same-directory PNG
screenshots into
`evidence/packaged-ai-evidence-manifest-86cbb6b9-20260826-final.json`.
The manifest records `packagedEvidenceSet: passed` while preserving
`overallAcceptance: partial/blocked` and the two unverified scopes. It is a new
atomic `0600` file; the two earlier manifests were neither replaced nor
deleted.

The verifier suite passed 21 focused cases. The suite covers exact-key and
identity drift, Failure Matrix candidate bounds, cancel timing, report and
screenshot leaf symlinks, report-directory retargeting, pre-mkdir bundle
containment, output-directory retargeting, post-publish rollback after a
directory rename, stable error JSON, CLI symlink entry, and inert module
imports. Independent probes confirmed the two prior P1 findings now leave no
bundle directory, published manifest, or temporary file.

Residual boundary: Node does not expose dirfd-relative
`openat`/`mkdirat`/`unlinkat`. A malicious process with concurrent write access
can still attempt transient path ABA between path validation and filesystem
operations, and rollback identity-check plus unlink is not one atomic syscall.
Persistent retargets are rejected, a published inode is truncated and synced
before cleanup, and a same-parent directory rename is recovered by bounded
inode lookup; the verifier does not claim kernel-level exclusion against an
active same-user filesystem attacker.

## Source Gates For This Package

- NetworkService passed 27 focused tests; the expanded affected-path suite
  passed 123 tests across NetworkService, Local Provider, SDK, error
  normalization, and plugin download behavior.
- Failure Matrix runner tests passed 85 cases, including the missing first
  observation recovery regression. Reverting the recovery condition made that
  regression fail before the fixed suite returned green.
- CoreApp Node and Web typechecks, the Vite build, all five official plugin
  rebuilds, and bundled-plugin seed verification passed.
- Targeted ESLint, Prettier, and scoped `git diff --check` passed.
- The packaged evidence verifier passed 21 focused tests; its source and test
  passed CoreApp Node typecheck and Prettier. Privacy inventory verification
  passed 14 entries and 35 structural evidence references.
- The packaged timeout scenario behaviorally exercised the stream deadline fix;
  no separate binary-inspection manifest was retained.

## Remaining Gates And Risks

- Real MCP remains blocked because this environment has no explicit opt-in; no
  mock or local tool fixture is promoted as that evidence.
- Durable orchestrator `objective`/`cwd`/`output` still lacks typed Privacy
  delete and automatic retention coverage.
- The earlier first-profile Tool failure remains an unresolved flaky risk even
  though later packages passed their first fresh runs.
- Formal macOS distribution trust remains outside this local ad-hoc package and
  requires Developer ID, notarization, stapling, and Gatekeeper evidence.

All currently runnable packaged Tool, Provider, secure-store, cancellation, and
fixed-failure gates pass on one version and physical `app.asar` identity. The
task remains `in_progress` and must not be archived while the real MCP gate is
blocked or the durable orchestrator Privacy delete/retention gap remains open.
