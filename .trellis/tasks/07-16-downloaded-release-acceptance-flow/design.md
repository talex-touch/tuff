# Design: downloaded release acceptance flow

## Decision

Treat a published release as an external product artifact, not as a local build. The acceptance run uses the repository only for the expected version and existing validators/probes. It downloads the published host artifact and manifest into an isolated temporary root, validates the complete remote matrix read-only, then launches only the downloaded app with a disposable profile.

No new release validator or duplicate runtime probe is introduced. The durable output is a project release-testing contract that composes existing tools in one fixed order.

## Inputs

- Default target version: `package.json.version`, which must equal `apps/core-app/package.json.version`.
- Default tag: `v<version>`.
- Default Nexus base URL: `https://tuff.tagzxia.com`.
- Host runtime target: current `process.platform/process.arch`; this run is `darwin/arm64`.
- Explicit user tag overrides the default only when requested.

## Four acceptance gates

### Gate A — release identity and remote matrix

1. Read root/CoreApp versions and require equality.
2. Query the authenticated GitHub Release and record tag, prerelease state, publication time, asset names, sizes, digests, and URLs.
3. Run the existing remote release gate against Nexus and GitHub.
4. Verify Nexus release metadata, BETA latest, platform matrix, signed download endpoints, signature endpoints, signing key, manifest inventory, and GitHub/Nexus matrix parity.

This gate is read-only. Missing signatures or signing keys remain failures; the flow never downgrades them to success.

### Gate B — downloaded artifact integrity and macOS security

1. Download `tuff-release-manifest.json` and the matching host asset into `/tmp/tuff-release-acceptance/<tag>/downloads`.
2. Run `scripts/update-validate-release-manifest.mjs` against the downloaded manifest.
3. Compute local SHA-256 and compare it with both manifest metadata and GitHub asset digest.
4. Extract to `/tmp/tuff-release-acceptance/<tag>/unpacked` without writing to `/Applications` or `~/Downloads`.
5. Inspect `Info.plist`, Mach-O architecture, executable permission, `codesign --verify --deep --strict`, and `spctl --assess --type execute`.

A release can pass content integrity while failing macOS trust. Those are separate results.

### Gate C — isolated packaged runtime

1. Launch the extracted executable with a disposable userData root and a bounded CDP port.
2. Reuse `coreapp-packaged-indexing-diagnostics-probe.ts`; it pre-seeds only low-sensitive diagnostic state, drives the packaged Settings UI over CDP, captures DOM/screenshot evidence, and terminates the process.
3. Require CDP/renderer availability, Settings navigation, indexed-source diagnostics, detail-panel rendering, and clean process teardown.
4. Never attach to the user's installed app or real profile.

The packaged probe is the runtime smoke. It is stronger than process-start-only evidence because it proves a renderer target and one typed main/renderer diagnostic path.

### Gate D — evidence, classification, and durable trigger

- Curated evidence lives under the task's `evidence/` directory; raw download bytes, unpacked app, userData, and full logs remain in `/tmp` and are not committed.
- Every check is classified `pass`, `fail`, `blocked`, or `static-only`.
- Windows/Linux receive remote matrix/download endpoint coverage only on macOS.
- The project spec defines the phrase **“发版测试”** as Gates A → B → C → D, defaulting to the repository current version.

## Safety boundaries

- No production POST/PUT/PATCH/DELETE calls.
- No account login, API keys, updater installation, app replacement, quarantine removal, ad-hoc signing, or system security changes.
- No reuse of workspace `dist` as runtime evidence.
- Only supervised test processes are terminated; the installed Tuff process is never targeted.
- Temporary profile and unpacked files are deleted after evidence has been summarized.

## Failure semantics

- Metadata, manifest, digest, version, architecture, executable, or runtime mismatch: `fail`.
- Missing signature sidecars/signing key or Gatekeeper rejection: `fail`, not warning-only.
- A platform that cannot execute on the host: `static-only`, not `pass`.
- External rate limit or unreachable endpoint after authenticated retry: `blocked` with the exact endpoint and response.
- A failed gate does not stop independent read-only checks; runtime only proceeds when the host artifact is structurally safe to execute.

## Rollback

This flow does not mutate product state. Rollback is removal of the temporary root and termination of the supervised packaged process. Project changes are limited to the task evidence and release-testing specification.
