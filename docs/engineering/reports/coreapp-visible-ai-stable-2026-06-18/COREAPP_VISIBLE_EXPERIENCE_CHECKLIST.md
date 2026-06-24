# CoreApp Visible Experience Evidence

- Schema: coreapp-visible-experience-evidence/v1
- Baseline version: 2.4.12-beta.8
- Generated at: 2026-06-18T12:27:45.998Z

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
  - ../startup-packaged-hot-runs-2026-06-21/汇总报告.md
  - ../startup-packaged-hot-runs-2026-06-21/第10次运行报告.md
- Notes:
  - 2026-06-21 packaged hot benchmark uses the current `2.4.12-beta.8` artifact and passed 10/10 runs with Startup health P50 552ms, P95 810ms, 0 WARN, and 0 ERROR.

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
  - ../startup-packaged-cold-runs-2026-06-21/汇总报告.md
  - ../startup-packaged-cold-runs-2026-06-21/第01次运行报告.md
  - startup-packaged-cold-long-tail-notes.md
- Notes:
  - 2026-06-21 packaged cold benchmark uses per-run isolated userData directories and passed 10/10 runs with Startup health P50 572ms, P95 615ms, 0 WARN, and 0 ERROR. Run 08 is the long-tail sample at 615ms.

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
  - startup-first-screen-settings.png
  - startup-first-screen-settings-dom.json
  - startup-health-summary.png
  - startup-health-summary-dom.json
  - startup-first-screen-cdp-target-inventory.json
- Notes:
  - 2026-06-21 packaged CDP capture uses the current `2.4.12-beta.8` artifact with isolated userData. The first usable main CoreApp screen is Settings/onboarding, not blank or blocked loading; DOM evidence records version/build metadata and the Startup health summary in Settings/About. The screenshot intentionally preserves the real first-run permission guidance overlay, while `startup-health-summary-dom.json` proves Startup health remains reachable on the same Settings target.

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
  - corebox-search-states-recapture-2026-06-22-r2d.json
  - corebox-search-cdp-inventory-2026-06-22-r2d.json
  - corebox-search-idle-2026-06-22-r2d.png
  - corebox-search-idle-2026-06-22-r2d-dom.json
  - corebox-search-searching-2026-06-22-r2d.png
  - corebox-search-searching-2026-06-22-r2d-dom.json
  - corebox-search-no-result-2026-06-22-r2d.png
  - corebox-search-no-result-2026-06-22-r2d-dom.json
  - corebox-search-cdp-inventory-2026-06-22-r2i.json
  - corebox-search-result-pills-2026-06-22-r2i.png
  - corebox-search-result-pills-2026-06-22-r2i-dom.json
- Notes:
  - 2026-06-21 packaged CDP 9434/9435 attempted recapture is blocker-only. The 720x500 `division-box` target shows the shell but does not run local search results; the ordinary `core-box` target accepts input but remains 720x56 with `.CoreBoxRes` hidden, so no-result retry/settings and result reason pills are not visible. Invalid captures were moved to `raw/blocker-corebox-search-*` and must not be used to mark this item passed.
  - 2026-06-22 R2D packaged recapture used the rebuilt `2.4.12-beta.10` signed app bundle, `TUFF_STARTUP_BENCHMARK_ONCE=1`, and isolated profile `/tmp/tuff-corebox-r2-profile-20260622-r2d`; the ordinary `core-box` target is reachable and idle evidence remains valid.
  - 2026-06-22 R2D confirms the packaged resize chain no longer sticks at `720x56` for visible search states: searching/warm-up is visible at `720x243`, and no-result retry plus File Index settings are covered by a `1440x390` screenshot (`720x195` CSS viewport).
  - 2026-06-22 R2I reused the initialized packaged profile and captured a real `screenshot` result query: the ordinary `core-box` window resized from `720x56` to `720x242`, returned 2 rows, and showed source/status/reason pills without overlap, including the system row source badge `系统`, status `系统 · System Actions`, and reason `· System Actions`.
  - `corebox-search-states` is now `passed`; the global visible gate still remains open because app-index/login/OmniPanel/Assistant/Workflow/Provider broader surfaces are still pending.

### App Index manager workbench

- ID: app-index-workbench
- Group: search
- Required: yes
- Requires screenshot/recording: yes
- Status: pending
- Collection steps:
  - Open the App Index manager from Settings.
  - Capture summary counts and source filters.
  - Apply at least one source filter and one diagnostic filter, then capture the filtered state.
- Required evidence:
  - [ ] Summary counts are visible
  - [ ] Source filters cover UWP/Store, Steam, shortcuts, protocol, AppRef, and path entries
  - [ ] Diagnostic filters distinguish attention, found, unchecked, and disabled entries
  - [ ] Empty states distinguish no entries from filtered-out entries
- Recommended artifacts:
  - evidence/coreapp-visible/app-index-summary.png
  - evidence/coreapp-visible/app-index-filtered-empty.png
- Block instead of pass when:
  - The manager has no diagnostic/source filter evidence.
  - Filtered empty state cannot be distinguished from an unconfigured app index.
- Artifact paths:
  - _none_
- Notes:

### Browser login recovery

- ID: browser-login-recovery
- Group: auth
- Required: yes
- Requires screenshot/recording: yes
- Status: passed
- Collection steps:
  - Trigger login while forcing or observing a browser-open failure path.
  - Capture the recovery dialog with manual URL and short-code copy actions.
  - Capture timeout or network-failure copy if the session fails.
- Required evidence:
  - [x] Browser-open failure keeps the device authorization session alive
  - [x] Manual login URL copy action is visible
  - [x] Short user code copy action is visible
  - [x] Timeout and network failure copy is user-readable
- Recommended artifacts:
  - evidence/coreapp-visible/login-browser-open-failure.png
  - evidence/coreapp-visible/login-timeout-or-network-failure.png
- Block instead of pass when:
  - The dialog only shows a generic error without manual recovery actions.
  - The device authorization session is cancelled before the user can copy recovery data.
- Artifact paths:
  - login-browser-open-failure.png
  - login-browser-open-failure-probe.json
  - login-timeout-or-network-failure.png
  - login-timeout-or-network-failure-probe.json
- Notes: 2026-06-24 packaged 2.4.13-beta.1 capture used isolated userData profiles and TUFF_VISIBLE_EVIDENCE_AUTH=1 with TUFF_STARTUP_BENCHMARK_ONCE=1. The browser-open failure probe forced TUFF_VISIBLE_EVIDENCE_AUTH_BROWSER_OPEN_FAIL=1 and captured the waiting recovery dialog with manual login URL copy, short-code copy, reopen, and cancel actions; both copy buttons reported success. The timeout probe used TUFF_VISIBLE_EVIDENCE_AUTH_LOGIN_TIMEOUT_MS=3000 and captured readable timeout copy with retry/close actions, plus network failure copy recorded in JSON.

### CoreBox AI Ask preview

- ID: corebox-ai-ask
- Group: ai
- Required: yes
- Requires screenshot/recording: yes
- Status: passed
- Collection steps:
  - Ask a text question from CoreBox and capture the text.chat answer preview.
  - Ask with a clipboard image and capture the vision.ocr to text.chat answer preview.
  - Capture provider/model/latency/trace/input metadata in the preview footer for both success paths.
  - Capture recoverable failure states for logged-out, provider unavailable, quota exhausted, and model unsupported cases.
  - Capture permission denied and Local/Ollama routing cases; local preferred routing must not reach a disabled Nexus provider.
- Required evidence:
  - [x] CoreBox AI Ask text.chat success preview is visible
  - [x] CoreBox AI Ask clipboard image vision.ocr to text.chat success preview is visible
  - [x] Text and OCR success previews show a non-empty answer without empty-response copy
  - [x] Provider, model, latency, trace id, and input kind metadata are visible for text and OCR paths
  - [x] Copy failure remains visible inside the preview
  - [x] Logged-out failure shows a sign-in recovery hint
  - [x] Provider unavailable failure shows a provider health or settings recovery hint
  - [x] Quota exhausted failure shows a credits or team quota recovery hint
  - [x] Model unsupported failure shows a supported model or capability recovery hint
  - [x] Permission denied failure does not call Intelligence SDK and shows a permission recovery hint
  - [x] Local/Ollama preferred routing does not call disabled Nexus provider and shows routing trace or provider metadata
- Required evidence tags:
  - [x] AI-STABLE-01
    - packaged-ai-ask-text-success-probe.json
    - packaged-ai-ask-text-success.png
  - [x] AI-STABLE-02
    - raw/packaged-ai-ask-ocr-forced-feature-updated-plugin-after-wait-probe.json
    - raw/packaged-ai-ask-ocr-forced-feature-updated-plugin-after-wait.png
  - [x] AI-STABLE-03
    - packaged-ai-ask-logged-out-probe.json
    - packaged-ai-ask-logged-out.png
  - [x] AI-STABLE-04
    - packaged-ai-ask-provider-unavailable-probe.json
    - packaged-ai-ask-provider-unavailable.png
  - [x] AI-STABLE-05
    - packaged-ai-ask-quota-exhausted-probe.json
    - packaged-ai-ask-quota-exhausted.png
  - [x] AI-STABLE-06
    - packaged-ai-ask-provider-enabled-probe.json
    - packaged-ai-ask-provider-enabled-after-enter.png
  - [x] AI-STABLE-07
    - packaged-ai-ask-runtime-permission-denied-probe.json
    - packaged-ai-ask-runtime-permission-denied-after-enter.png
    - packaged-ai-ask-copy-failure-probe.json
    - packaged-ai-ask-copy-failure.png
  - [x] AI-STABLE-08
    - packaged-ai-ask-local-ollama-routing-probe.json
    - packaged-ai-ask-local-ollama-routing-after-enter.png
- Recommended artifacts:
  - evidence/coreapp-visible/corebox-ai-text-success.png
  - evidence/coreapp-visible/corebox-ai-ocr-success.png
  - evidence/coreapp-visible/corebox-ai-copy-failure.png
  - evidence/coreapp-visible/corebox-ai-failure-logged-out.png
  - evidence/coreapp-visible/corebox-ai-failure-provider-unavailable.png
  - evidence/coreapp-visible/corebox-ai-failure-quota-exhausted.png
  - evidence/coreapp-visible/corebox-ai-failure-model-unsupported.png
  - evidence/coreapp-visible/corebox-ai-failure-permission-denied.png
  - evidence/coreapp-visible/corebox-ai-local-ollama-routing.png
- Block instead of pass when:
  - The preview hides provider/model/trace context.
  - Text success and OCR success are not captured as separate recent paths.
  - Logged-out, provider unavailable, quota exhausted, or model unsupported appears as a generic error without a recovery hint.
  - Permission denied still invokes Intelligence SDK.
  - Local/Ollama preferred routing calls a disabled Nexus provider.
- Artifact paths:
  - packaged-corebox-hotkey-capture.json
  - packaged-corebox-hotkey-page-04.png
  - packaged-ai-ask-provider-enabled-probe.json
  - packaged-ai-ask-provider-enabled-after-enter.png
  - packaged-ai-ask-runtime-permission-denied-probe.json
  - packaged-ai-ask-runtime-permission-denied-after-enter.png
  - packaged-ai-ask-local-ollama-routing-probe.json
  - packaged-ai-ask-local-ollama-routing-after-enter.png
  - packaged-ai-ask-quota-exhausted-probe.json
  - packaged-ai-ask-quota-exhausted.png
  - packaged-ai-ask-logged-out-probe.json
  - packaged-ai-ask-logged-out.png
  - packaged-ai-ask-provider-unavailable-probe.json
  - packaged-ai-ask-provider-unavailable.png
  - packaged-ai-ask-text-success-probe.json
  - packaged-ai-ask-text-success.png
  - raw/packaged-ai-ask-ocr-forced-feature-updated-plugin-after-wait-probe.json
  - raw/packaged-ai-ask-ocr-forced-feature-updated-plugin-after-wait.png
  - packaged-ai-ask-copy-failure-probe.json
  - packaged-ai-ask-copy-failure.png
- Notes:
  - 2026-06-21 packaged OCR handoff evidence is accepted under `raw/` because it is the latest AI-STABLE-02 capture: the UI shows OCR response, text.chat capability, provider/model/latency/trace metadata, input kind `text, image`, and image-to-text context copy without failure counter-signals.
  - 2026-06-21 copy failure packaged evidence is closed by `packaged-ai-ask-copy-failure-probe.json` and `packaged-ai-ask-copy-failure.png`: the DOM contains `.AiChatbot__copyFailureNotice`, `复制失败：缺少 clipboard.write 权限`, and the permission recovery hint inside the answer preview. Historical raw copy-failure captures remain blocker diagnostics only.

### OmniPanel Writing Tools

- ID: omnipanel-writing-tools
- Group: ai
- Required: yes
- Requires screenshot/recording: yes
- Status: passed
- Collection steps:
  - Open OmniPanel with selected text and capture available writing actions.
  - Run translate, summarize, rewrite, explain, or review and capture the result preview.
  - Capture copy, replace clipboard, retry, and replace confirmation states.
- Required evidence:
  - [x] Selected-text context or recovery hint is visible
  - [x] Translate/summarize/rewrite/explain/review actions are visible as applicable
  - [x] AI result preview is visible
  - [x] Copy, replace clipboard, retry, and confirmation states are visible
- Recommended artifacts:
  - evidence/coreapp-visible/omnipanel-writing-tools.png
  - evidence/coreapp-visible/omnipanel-replace-confirmation.png
  - evidence/coreapp-visible/omnipanel-selection-recovery.png
- Block instead of pass when:
  - No selected-text context or recovery hint is visible.
  - Clipboard replace can happen without confirmation evidence.
- Artifact paths:
  - omnipanel-writing-tools.png
  - omnipanel-replace-confirmation.png
  - omnipanel-selection-recovery.png
  - omnipanel-writing-tools-probe.json
- Notes:
  - 2026-06-24 packaged CoreApp 2.4.13-beta.1 evidence used an isolated profile `/tmp/tuff-omnipanel-evidence-20260624-9485` and real OmniPanel renderer interaction over CDP.
  - Local/Ollama provider `local-default` was configured with `qwen2.5:3b` and Nexus disabled; `AI 改写` invoked `text.rewrite` successfully through provider `local`, model `qwen2.5:3b`, trace `local-1782279378320-f5jm7e`, and latency `1234ms`.
  - Screenshots show selected-text context/recovery hint, five writing actions (`AI 翻译`, `AI 摘要`, `AI 改写`, `AI 解释`, `AI Review`), AI result metadata chips, `重试` / `复制` / `替换剪贴板`, explicit replace confirmation (`待确认` / `确认替换`), and no-selection recovery hint.

### Assistant floating ball entry

- ID: assistant-floating-ball-entry
- Group: assistant
- Required: yes
- Requires screenshot/recording: yes
- Status: pending
- Collection steps:
  - Enable Assistant and the floating ball from Settings while keeping voice wake disabled.
  - Capture the floating ball visible above the current desktop or CoreApp surface.
  - Drag the floating ball, reopen the app or settings surface, and capture the persisted position.
  - Click the floating ball and capture the Voice Panel opened next to the ball.
- Required evidence:
  - [ ] Settings show Assistant enabled and voice wake disabled
  - [ ] Floating ball is visible and does not steal focus from the active app
  - [ ] Dragged floating ball position persists after reopening the Assistant surface
  - [ ] Clicking the floating ball opens the Voice Panel beside the ball
- Recommended artifacts:
  - evidence/coreapp-visible/assistant-floating-ball-settings.png
  - evidence/coreapp-visible/assistant-floating-ball-visible.png
  - evidence/coreapp-visible/assistant-floating-ball-drag-persist.png
  - evidence/coreapp-visible/assistant-voice-panel-open.png
- Block instead of pass when:
  - The floating ball only appears after enabling voice wake.
  - The dragged position is lost after reopening or monitor bounds are not respected.
  - Clicking the floating ball does not open a usable text panel.
- Artifact paths:
  - _none_
- Notes:

### Assistant clipboard image translation

- ID: assistant-screenshot-translate
- Group: assistant
- Required: yes
- Requires screenshot/recording: yes
- Status: pending
- Collection steps:
  - Open the Assistant Voice Panel from the floating ball and trigger clipboard image translation.
  - Capture the translated image pin window or detached DivisionBox result for a copied image.
  - Repeat with an empty clipboard image state and capture the recovery hint.
  - Repeat with Nexus/provider unavailable or logged out and capture the fallback or recovery hint.
- Required evidence:
  - [ ] Clipboard image translation starts from the Assistant Voice Panel
  - [ ] The Assistant action reads the current clipboard image instead of initiating screen capture
  - [ ] Translated clipboard image result appears in the image translation pin window or detached widget
  - [ ] Empty clipboard image and provider fallback remain visible and recoverable
- Recommended artifacts:
  - evidence/coreapp-visible/assistant-clipboard-image-translate-start.png
  - evidence/coreapp-visible/assistant-clipboard-image-translate-result.png
  - evidence/coreapp-visible/assistant-clipboard-image-empty.png
  - evidence/coreapp-visible/assistant-clipboard-image-provider-fallback.png
- Block instead of pass when:
  - The Assistant path captures the screen instead of consuming the current clipboard image.
  - The action writes only to clipboard and does not show a visible translation result.
  - Permission/provider failures collapse into a generic error without a recovery hint.
- Artifact paths:
  - _none_
- Notes:

### Workflow Use Model and Review Queue

- ID: workflow-use-model-review-queue
- Group: workflow
- Required: yes
- Requires screenshot/recording: yes
- Status: pending
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
  - _none_
- Notes:

### Nexus Provider Registry observability

- ID: provider-registry-observability
- Group: provider
- Required: yes
- Requires screenshot/recording: yes
- Status: pending
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
  - _none_
- Notes:

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
  - [ ] Dry-run or execute migration evidence summary is attached
  - [ ] Readiness, blockers, migrated/skipped/failed counts are visible
  - [ ] No provider secret is copied into metadata or evidence text
  - [ ] Registry-primary readiness is not claimed for dry-run-only evidence
- Recommended artifacts:
  - evidence/coreapp-visible/provider-migration-dry-run.md
  - evidence/coreapp-visible/provider-migration-execute.md
- Block instead of pass when:
  - Dry-run-only evidence is used to claim registry-primary runtime readiness.
  - The copied evidence contains provider secrets or raw API keys.
- Artifact paths:
  - _none_
- Notes:

## Final Verification

```bash
corepack pnpm -C "apps/core-app" run visible:experience:verify -- --input "../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/coreapp-visible-experience-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireEvidenceTags --requireExistingArtifacts --requireNonEmptyArtifacts
```
