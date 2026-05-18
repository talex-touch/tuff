# CoreApp Visible Experience Evidence

- Schema: coreapp-visible-experience-evidence/v1
- Baseline version: 2.4.10-beta.25
- Generated at: 2026-05-17T09:07:15.638Z

## Collection Rules

- Use real CoreApp UI on the target device; do not substitute mock screenshots.
- Keep sensitive content out of screenshots and notes.
- Mark an item `blocked` rather than `passed` when the required artifact is missing.
- Attach the packaged startup benchmark reports separately from UI screenshots.

## Required Surfaces

### Packaged hot startup benchmark

- ID: startup-packaged-hot
- Group: startup
- Required: yes
- Requires screenshot/recording: no
- Status: passed
- Collection steps:
  - Confirm the packaged app bundle version matches apps/core-app/package.json.
  - Run the packaged hot-start benchmark against the current bundle.
  - Attach the summary report and at least one per-run report.
- Required evidence:
  - [x] Current package version is used by the packaged artifact
  - [x] Hot-start benchmark summary path is attached
  - [x] Startup health and renderer-ready timing are captured
  - [x] Warnings/errors are recorded without redaction of failure codes
- Recommended artifacts:
  - docs/engineering/reports/startup-packaged-hot-runs-YYYY-MM-DD/汇总报告.md
  - docs/engineering/reports/startup-packaged-hot-runs-YYYY-MM-DD/第01次运行报告.md
- Block instead of pass when:
  - The packaged artifact version does not match the package baseline.
  - The app does not reach startup health or renderer-ready markers.
- Artifact paths:
  - ../startup-packaged-hot-runs-2026-05-17/汇总报告.md
  - ../startup-packaged-hot-runs-2026-05-17/第23次运行报告.md
- Notes:
  Current local packaged artifact is 2.4.10-beta.25 and matches apps/core-app/package.json. codesign --verify --deep --strict passed with no output. The latest 10 hot runs pass with Startup health P50 1700ms, P95 1900ms, 0 WARN, and 0 ERROR.

### Packaged cold startup benchmark

- ID: startup-packaged-cold
- Group: startup
- Required: yes
- Requires screenshot/recording: no
- Status: passed
- Collection steps:
  - Use an isolated userData directory for cold-start samples.
  - Run the packaged cold-start benchmark against the current bundle.
  - Attach the summary report and WAL/health long-tail notes.
- Required evidence:
  - [x] Current package version is used by the packaged artifact
  - [x] Cold-start benchmark summary path is attached
  - [x] Isolated userData path is used
  - [x] WAL/health long-tail notes are attached
- Recommended artifacts:
  - docs/engineering/reports/startup-packaged-cold-runs-YYYY-MM-DD/汇总报告.md
  - docs/engineering/reports/startup-packaged-cold-runs-YYYY-MM-DD/第01次运行报告.md
- Block instead of pass when:
  - The run uses the normal user profile instead of an isolated benchmark profile.
  - Cold-start timing is collected from a stale packaged artifact.
- Artifact paths:
  - ../startup-packaged-cold-runs-2026-05-17/汇总报告.md
  - ../startup-packaged-cold-runs-2026-05-17/第01次运行报告.md
  - startup-packaged-cold-long-tail-notes.md
- Notes:
  Current local packaged artifact is 2.4.10-beta.25 and matches apps/core-app/package.json. 10/10 cold runs pass with Startup health P50 1100ms, P95 3400ms, 0 WARN, and 0 ERROR. Run 01 remains the long-tail sample and must be paired with first-screen visual evidence before closing the broader startup UX item.

### First-screen visual state

- ID: startup-first-screen
- Group: startup
- Required: yes
- Requires screenshot/recording: yes
- Status: passed
- Collection steps:
  - Launch the current app build and wait only until the first usable screen appears.
  - Capture the full first screen before navigating away.
  - Open Settings/About or diagnostics and capture the reachable startup health summary.
- Required evidence:
  - [x] Screenshot or recording shows the first usable CoreApp screen
  - [x] No blank or blocked loading surface is visible
  - [x] Startup health summary is reachable from Settings/About
- Recommended artifacts:
  - evidence/coreapp-visible/startup-first-screen.png
  - evidence/coreapp-visible/startup-health-summary.png
- Block instead of pass when:
  - The screenshot is taken after manual navigation that hides startup state.
  - The first screen is blank, indefinitely loading, or missing startup health access.
- Artifact paths:
  - startup-first-screen-onboarding.png
  - startup-settings-after-onboarding.png
  - startup-first-screen-onboarding-dom.json
  - startup-settings-after-onboarding-dom.json
  - cdp-target-inventory.json
- Notes:
  Packaged Electron CDP evidence captured from the current 2.4.10-beta.25 local artifact. The first usable screen is an onboarding/login surface rather than a blank page, and Settings/About remains reachable with version, build id, login state, permission state, and startup health visible.

### CoreBox search states

- ID: corebox-search-states
- Group: search
- Required: yes
- Requires screenshot/recording: yes
- Status: passed
- Collection steps:
  - Open CoreBox with no query and capture the idle or warm-up state.
  - Run a query that returns no results and capture the retry/settings actions.
  - Run a query with mixed sources and capture status/reason pills in result rows.
- Required evidence:
  - [x] Idle state is visible before query input
  - [x] Searching or recommendation warm-up state is visible
  - [x] No-result state shows retry and File Index settings actions
  - [x] Result source/status/reason pills fit without overlap
- Recommended artifacts:
  - evidence/coreapp-visible/corebox-idle.png
  - evidence/coreapp-visible/corebox-no-result.png
  - evidence/coreapp-visible/corebox-result-reasons.png
- Block instead of pass when:
  - A screenshot only shows populated results and misses idle/no-result states.
  - Reason/status text overlaps row content or is clipped.
- Artifact paths:
  - corebox-idle.png
  - corebox-no-result.png
  - corebox-result-reasons.png
  - corebox-ai-recovery.png
  - corebox-idle-dom.json
  - corebox-no-result-dom.json
  - corebox-result-reasons-dom.json
  - corebox-ai-recovery-dom.json
- Notes:
  Rebuilt packaged Electron CDP artifacts cover idle, no-result, searching/loading, and populated result states. The no-result capture shows retry and File Index settings actions; the result capture includes mixed application/system rows with localized completion/footer text (`hasRawI18n=false`) and source/quick-key signal rails fitting without visible overlap.

### App Index manager workbench

- ID: app-index-workbench
- Group: search
- Required: yes
- Requires screenshot/recording: yes
- Status: passed
- Collection steps:
  - Open the App Index manager from Settings.
  - Capture summary counts and source filters.
  - Apply at least one source filter and one diagnostic filter, then capture the filtered state.
- Required evidence:
  - [x] Summary counts are visible
  - [x] Source filters cover UWP/Store, Steam, shortcuts, protocol, AppRef, and path entries
  - [x] Diagnostic filters distinguish attention, found, unchecked, and disabled entries
  - [x] Empty states distinguish no entries from filtered-out entries
- Recommended artifacts:
  - evidence/coreapp-visible/app-index-summary.png
  - evidence/coreapp-visible/app-index-filtered-empty.png
- Block instead of pass when:
  - The manager has no diagnostic/source filter evidence.
  - Filtered empty state cannot be distinguished from an unconfigured app index.
- Artifact paths:
  - app-index-manager-current.png
  - app-index-manager-current-dom.json
- Notes:
  Rebuilt packaged Electron CDP evidence on port `9338` reaches Settings -> file-index and contains the App Index manager workbench DOM. The capture used isolated userData at `/private/tmp/tuff-visible-cdp-user-data-6` and added `/System/Applications/Calculator.app` through the renderer `app:app-index:add-path` channel before applying the Steam source filter. `app-index-manager-current-dom.json` records `preFilter.entryCount=1`, summary counts, all source and diagnostic chips, active Steam filtered-empty state text, `hasRawI18n=false`, and no raw `common.all` keys.

### Browser login recovery

- ID: browser-login-recovery
- Group: auth
- Required: yes
- Requires screenshot/recording: yes
- Status: blocked
- Collection steps:
  - Trigger login while forcing or observing a browser-open failure path.
  - Capture the recovery dialog with manual URL and short-code copy actions.
  - Capture timeout or network-failure copy if the session fails.
- Required evidence:
  - [ ] Browser-open failure keeps the device authorization session alive
  - [ ] Manual login URL copy action is visible
  - [ ] Short user code copy action is visible
  - [ ] Timeout and network failure copy is user-readable
- Recommended artifacts:
  - evidence/coreapp-visible/login-browser-open-failure.png
  - evidence/coreapp-visible/login-timeout-or-network-failure.png
- Block instead of pass when:
  - The dialog only shows a generic error without manual recovery actions.
  - The device authorization session is cancelled before the user can copy recovery data.
- Artifact paths:
- Notes:
  Startup/settings CDP evidence shows unauthenticated account state and login entry points. Source now propagates browser-open failure from main auth to renderer, shows manual login link/code recovery copy while keeping the device authorization session waiting, and classifies Settings login failures into localized browser-open, timeout, callback/token, device-authorization, rate-limit, quota, permission, expired-session, network, and service-outage recovery copy with focused tests. Real packaged UI evidence for forced browser-open failure, manual URL copy, short-code copy, and timeout/network recovery copy still needs recapture.

### CoreBox AI Ask preview

- ID: corebox-ai-ask
- Group: ai
- Required: yes
- Requires screenshot/recording: yes
- Status: blocked
- Collection steps:
  - Ask a text question from CoreBox and capture the answer preview.
  - Capture provider/model/latency/trace/input metadata in the preview footer.
  - Capture at least one recoverable failure state such as auth, quota, provider, or capability.
- Required evidence:
  - [ ] Text answer preview is visible
  - [ ] Provider, model, latency, trace id, and input kind metadata are visible
  - [ ] Copy failure remains visible inside the preview
  - [ ] Auth/quota/provider/capability/permission failures show recovery hints
- Recommended artifacts:
  - evidence/coreapp-visible/corebox-ai-answer.png
  - evidence/coreapp-visible/corebox-ai-recovery.png
- Block instead of pass when:
  - The preview hides provider/model/trace context.
  - Failure state appears as a generic error without a recovery hint.
- Artifact paths:
  - corebox-ai-recovery.png
  - corebox-ai-recovery-dom.json
  - ai-desktop-source-coverage-blocked-2026-05-17.md
- Notes:
  Current packaged CDP artifact only captures a CoreBox AI/search loading state. Source now covers status tone, pending/ready/error hints, provider metadata, copy failure visibility, and metadata-pending fallback with focused tests, but there is no packaged Electron answer preview or recoverable failure capture. This surface remains blocked until packaged UI evidence shows answer metadata, copy failure visibility, and auth/quota/provider/capability recovery hints.

### OmniPanel Writing Tools

- ID: omnipanel-writing-tools
- Group: ai
- Required: yes
- Requires screenshot/recording: yes
- Status: blocked
- Collection steps:
  - Open OmniPanel with selected text and capture available writing actions.
  - Run translate, summarize, rewrite, explain, or review and capture the result preview.
  - Capture copy, replace clipboard, retry, and replace confirmation states.
- Required evidence:
  - [ ] Selected-text context or recovery hint is visible
  - [ ] Translate/summarize/rewrite/explain/review actions are visible as applicable
  - [ ] AI result preview is visible
  - [ ] Copy, replace clipboard, retry, and confirmation states are visible
- Recommended artifacts:
  - evidence/coreapp-visible/omnipanel-writing-tools.png
  - evidence/coreapp-visible/omnipanel-replace-confirmation.png
  - evidence/coreapp-visible/omnipanel-selection-recovery.png
- Block instead of pass when:
  - No selected-text context or recovery hint is visible.
  - Clipboard replace can happen without confirmation evidence.
- Artifact paths:
  - ai-desktop-source-coverage-blocked-2026-05-17.md
- Notes:
  Source now covers selected-context preview, running/ready/failed/confirming status details, labeled capability/provider/model/latency metadata chips, inline clipboard action failures, retry, copy, replace, and replace confirmation with focused tests. No packaged Electron selected-context, action list, result preview, copy/replace/retry, or replace-confirmation artifact is attached.

### Workflow Use Model and Review Queue

- ID: workflow-use-model-review-queue
- Group: workflow
- Required: yes
- Requires screenshot/recording: yes
- Status: blocked
- Collection steps:
  - Run a workflow containing a Use Model step.
  - Capture the generated output inside Review Queue before accepting it.
  - Capture pending, copied, clipboard-replaced, and failed filters or representative states.
- Required evidence:
  - [ ] Use Model output enters Review Queue
  - [ ] Pending/copied/clipboard-replaced/failed filters are visible
  - [ ] Runtime cost signals are visible
  - [ ] Failed copy/replace actions expose retry and clear-failure actions
- Recommended artifacts:
  - evidence/coreapp-visible/workflow-review-queue-pending.png
  - evidence/coreapp-visible/workflow-review-queue-failed.png
- Block instead of pass when:
  - Use Model output bypasses Review Queue.
  - Failed copy/replace actions cannot be retried or cleared from the queue.
- Artifact paths:
  - ai-desktop-source-coverage-blocked-2026-05-17.md
- Notes:
  Source now covers Review Queue filters, labeled runtime metadata chips, copy/replace confirmation, retry labels, clear-failure recovery, and focused tests. No packaged Electron workflow run artifact proves Use Model output entering Review Queue or the pending/copied/clipboard-replaced/failed states.

### Nexus Provider Registry observability

- ID: provider-registry-observability
- Group: provider
- Required: yes
- Requires screenshot/recording: yes
- Status: blocked
- Collection steps:
  - Open Nexus Provider Registry Admin with real registry data.
  - Capture provider health, latest usage, and attention filters.
  - Capture Scene latest run, recent failures, and next-action hints.
- Required evidence:
  - [ ] Provider health and latest usage summaries are visible
  - [ ] Scene latest run and recent failure summaries are visible
  - [ ] Attention/healthy/degraded/unhealthy/unknown filters are visible
  - [ ] Next-action hints explain degraded or unknown state
- Recommended artifacts:
  - evidence/coreapp-visible/provider-registry-health.png
  - evidence/coreapp-visible/provider-registry-scene-run.png
- Block instead of pass when:
  - The screenshot uses seed/mock data without marking it as non-production evidence.
  - Unknown or degraded provider state has no next-action hint.
- Artifact paths:
  - provider-registry-observability-blocked-2026-05-17.md
- Notes:
  A local Nexus Admin capture attempt is archived as negative evidence. Provider Registry Admin requires an active admin session and real registry data; local `dev:pure` was not stable enough to capture UI because Nuxt repeatedly exited with `EMFILE: too many open files, watch`. Source now distinguishes Provider/Scene initial empty, filtered empty, no-attention, no-unknown-provider, and no-failed-scene states, and filtered lists include a “show all” recovery action. Usage Ledger and Health tabs now expose local filter chips and next-action guidance for failed, planned, estimated, completed, unhealthy, degraded, and healthy rows with focused helper tests. This surface remains blocked until a real Dashboard Admin or real local-binding API/browser capture shows provider health, usage, scene run state, filters, and next-action hints.

### Legacy intelligence provider retirement evidence

- ID: provider-migration-evidence
- Group: provider
- Required: yes
- Requires screenshot/recording: no
- Status: pending
- Collection steps:
  - Run Provider Registry migration dry-run or execute mode from Dashboard Admin or API.
  - Copy the generated evidence summary.
  - Review the summary for readiness, blockers, counts, and secret leakage before attaching it.
- Required evidence:
  - [x] Dry-run or execute migration evidence summary is attached
  - [x] Readiness, blockers, migrated/skipped/failed counts are visible
  - [x] No provider secret is copied into metadata or evidence text
  - [x] Registry-primary readiness is not claimed for dry-run-only evidence
- Recommended artifacts:
  - evidence/coreapp-visible/provider-migration-dry-run.md
  - evidence/coreapp-visible/provider-migration-execute.md
- Block instead of pass when:
  - Dry-run-only evidence is used to claim registry-primary runtime readiness.
  - The copied evidence contains provider secrets or raw API keys.
- Artifact paths:
  - provider-migration-dry-run.md
- Notes:
  A local isolated dry-run artifact is attached from focused tests that execute the Provider Registry migration API handler and real migration bridge against Mock D1, verifying no registry or secure-store write occurs. It is not a user-session Dashboard or real local-binding API migration dry-run result, so this surface remains blocked until a real dry-run or execute summary is captured without secrets.

## Final Verification

```bash
pnpm -C "apps/core-app" run visible:experience:verify -- --input "../../docs/engineering/reports/coreapp-visible-evidence-2026-05-17/coreapp-visible-experience-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireExistingArtifacts --requireNonEmptyArtifacts
```
