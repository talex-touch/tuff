# CoreApp Visible Experience Strict Verify Result

> Date: 2026-05-18
> Manifest: `coreapp-visible-experience-manifest.json`
> Baseline: `2.4.10-beta.25`

## Command

```bash
pnpm -C "apps/core-app" run visible:experience:verify -- --input "../../docs/engineering/reports/coreapp-visible-evidence-2026-05-17/coreapp-visible-experience-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireExistingArtifacts --requireNonEmptyArtifacts
```

## Result

- Exit code: `1`
- Gate passed: `false`
- Expected outcome: yes

The strict verifier accepts the current packaged hot/cold startup artifacts,
the packaged CDP first-screen visual artifacts, and the rebuilt CoreBox search
state plus App Index workbench artifacts:

- `startup-packaged-hot`: passed
- `startup-packaged-cold`: passed
- `startup-first-screen`: passed
- `corebox-search-states`: passed
- `app-index-workbench`: passed

The gate still fails because the following required surfaces are not yet fully
passed:

- `browser-login-recovery`: blocked until the browser-open failure source fix
  is present in a rebuilt packaged artifact and manual link/code recovery plus
  timeout/network copy are recaptured.
- `corebox-ai-ask`: blocked. Source coverage is archived in
  `ai-desktop-source-coverage-blocked-2026-05-17.md`, and the current
  packaged capture only shows a loading/searching state, not an answer preview
  or recoverable failure.
- `omnipanel-writing-tools`: blocked. Source coverage is archived in
  `ai-desktop-source-coverage-blocked-2026-05-17.md`, but there is no packaged
  selected-context/result/copy/replace/confirmation artifact.
- `workflow-use-model-review-queue`: blocked. Source coverage is archived in
  `ai-desktop-source-coverage-blocked-2026-05-17.md`, but there is no packaged
  workflow run artifact showing Use Model output entering Review Queue.
- `provider-registry-observability`: blocked. A local Nexus Admin capture
  attempt is archived as
  `provider-registry-observability-blocked-2026-05-17.md`, but it is negative
  evidence only: the page requires an active admin session and real registry
  data, and local `dev:pure` repeatedly exited with `EMFILE: too many open
  files, watch`.
- `provider-migration-evidence`: blocked even though
  `provider-migration-dry-run.md` is attached and passes the local isolated
  API/bridge dry-run checklist, because that artifact is not a user-session
  Dashboard or real local-binding API dry-run or execute evidence summary.

## Completion Boundary

This failure is intentional. It prevents partial packaged CDP evidence,
generated manifests, browser-only blank screenshots, failed Electron dev
capture attempts, or source-only fixes from being counted as complete
visible-experience evidence.

CoreBox search-state evidence is no longer part of the failure boundary. The
rebuilt packaged Electron CDP capture on port `9336` shows idle, no-result,
searching/loading, and populated result states. `corebox-result-reasons-dom.json`
records `hasRawI18n=false` and the result signal rails fit without visible
overlap.

App Index workbench evidence is no longer part of the failure boundary. The
rebuilt packaged Electron CDP capture on port `9338` reaches Settings ->
file-index, exposes `.app-index-manager`, records `preFilter.entryCount=1`
after adding `/System/Applications/Calculator.app` through the renderer
`app:app-index:add-path` channel in isolated packaged userData, and captures an
active Steam source filtered-empty state with `hasRawI18n=false`.

Current source fixes for login recovery, AI Ask, OmniPanel, Review Queue, and
Provider Admin remain useful prerequisites, but they still require packaged
recapture or real admin/API evidence before those surfaces can pass.

The Provider Registry migration fixture now runs the migration API handler and
the real migration bridge against Mock D1, verifying that dry-run writes neither
registry entries nor secure-store credentials. It deliberately keeps the
surface blocked until a real Phase 0/1 Dashboard or real local-binding API
dry-run or execute result is captured.
