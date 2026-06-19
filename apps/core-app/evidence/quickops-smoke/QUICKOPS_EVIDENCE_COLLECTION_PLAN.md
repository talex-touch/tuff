# QuickOps Evidence Collection Plan

- Schema: quickops-evidence/v1
- Baseline version: 2.4.12-beta.8
- Generated at: 2026-06-19T05:11:59.748Z

## 0. Prepare Evidence Files

Run this from the repository root after building or selecting the packaged CoreApp artifact under test:

```bash
pnpm -C "apps/core-app" run quickops:evidence:template -- --output "evidence/quickops-smoke/quickops-evidence-manifest.json" --writeChecklist --writePlan
```

Do not mark a case `passed` until the manifest references current artifacts and every required evidence item is checked.

## 1. Source-Level Gate Artifacts

These commands produce required source-level artifacts. They do not replace packaged, platform, visual, or real confirmation UI evidence.

```bash
pnpm -C "apps/core-app" run quickops:surface:audit -- --output "evidence/quickops-smoke/sdk-transport-surface.json" --strict
pnpm -C "apps/core-app" run quickops:flow-ai:audit -- --output "evidence/quickops-smoke/flow-ai-adapter-audit.json" --strict
```

## 2. Manual And Packaged Evidence Matrix

### Packaged session cleanup and quit

- ID: quickops-packaged-session-cleanup
- Group: runtime
- Current manifest status: pending
- Visual artifact required: no
- Collect:
  1. Launch the current packaged CoreApp build with an isolated userData profile.
  2. Start keep-awake, system-awake, timer, pomodoro, stopwatch, and screen-clean sessions where supported.
  3. Quit the packaged app and attach logs or probe output proving every native blocker, timer, and overlay is released.
- Attach artifacts:
  - evidence/quickops/packaged-session-before-quit.json
  - evidence/quickops/packaged-session-after-quit.json
  - evidence/quickops/packaged-quit-log.txt
- Required checks before passing:
  - Packaged artifact version matches the manifest baseline
  - Running QuickOps sessions are visible before quit
  - App quit releases display and system power blockers
  - App quit closes screen-clean overlay windows and clears timers/stopwatch runtime
  - No BrowserWindow, timeout, or native blocker object is exposed in copied evidence
- Keep blocked when:
  - Evidence is collected from dev mode only.
  - The app is killed externally before the normal quit cleanup path runs.
  - Runtime objects or raw userData paths are pasted into the evidence.

### Screen clean and color test visual evidence

- ID: quickops-screen-clean-visual
- Group: visual
- Current manifest status: pending
- Visual artifact required: yes
- Collect:
  1. Start black, white, red, green, and blue screen-clean/color-test modes from CoreBox or Flow.
  2. Capture each overlay on at least one real display and record the long-press Esc recovery path.
  3. Capture the stopped or expired state after the overlay closes.
- Attach artifacts:
  - evidence/quickops/screen-clean-black.png
  - evidence/quickops/screen-clean-white.png
  - evidence/quickops/screen-color-red.png
  - evidence/quickops/screen-color-green.png
  - evidence/quickops/screen-color-blue.png
  - evidence/quickops/screen-clean-stop.mp4
- Required checks before passing:
  - Black and white clean-screen overlays are full screen and hide the cursor
  - Red, green, and blue color-test overlays render the requested solid color
  - Countdown and long-press Esc hints are visible without external resources
  - Stop, expiry, and destroy cleanup close every overlay window
  - Artifacts are screenshots or recordings from a real desktop display
- Keep blocked when:
  - Only data URL unit-test output is attached.
  - The screenshot is cropped so fullscreen coverage cannot be verified.
  - Recovery text overlaps or is clipped.

### Platform read-only network and system evidence

- ID: quickops-platform-readonly
- Group: platform
- Current manifest status: pending
- Visual artifact required: no
- Collect:
  1. Run local IP, port status, DNS query, network status, system proxy, battery status, system info, disk space, and directory usage on each supported platform.
  2. Record supported, degraded, and unsupported reasons without changing system settings.
  3. Attach redacted command/probe output and the copied QuickOps summary.
- Attach artifacts:
  - evidence/quickops/platform-macos.json
  - evidence/quickops/platform-windows.json
  - evidence/quickops/platform-linux.json
- Required checks before passing:
  - macOS, Windows, and Linux results are separated by platform
  - Local IP and network status do not perform external HTTP requests
  - Port status reports available/occupied/degraded without executing kill commands
  - DNS query uses the local resolver and records no system DNS mutation
  - System proxy output redacts credentials
  - Battery, disk, and directory usage failures surface degraded reasons instead of fake success
- Keep blocked when:
  - One platform result is reused to claim another platform.
  - Public IP or any external HTTP lookup is mixed into local-only evidence.
  - A failed probe is recorded as passed without a degraded reason.

### Files, recent download, path, and temp workspace evidence

- ID: quickops-files-and-temp
- Group: files
- Current manifest status: pending
- Visual artifact required: no
- Collect:
  1. Run file hash/base64, recent download, common directory, path format, temp text file, and temp directory cases against real local files.
  2. Capture permission denied, missing file, directory input, large file, empty Downloads, duplicate target, and successful temp workspace cases.
  3. Attach redacted paths and verify generated files stay under the Tuff QuickOps temp workspace.
- Attach artifacts:
  - evidence/quickops/files-hash-base64.json
  - evidence/quickops/files-recent-download.json
  - evidence/quickops/files-temp-workspace.json
  - evidence/quickops/files-path-format.json
- Required checks before passing:
  - File hash and file Base64 cover normal file, directory, missing path, permission failure, and size limit cases
  - Recent download covers found, empty Downloads, permission failure, duplicate move target, and explicit absolute move target cases
  - Common directory only resolves Desktop, Downloads, Documents, App Data, and Logs
  - Path format returns raw, shell, file URL, and Windows/WSL variants without requiring file existence
  - Temp text file and temp directory write only under the Tuff QuickOps temp workspace
  - Artifacts redact Home/userData paths where summaries are copied
- Keep blocked when:
  - Temp files are written outside the Tuff QuickOps temp workspace.
  - Recent download move overwrites an existing file.
  - Evidence contains unredacted Home or userData paths where redaction is expected.

### Confirmation, high-risk boundary, and policy evidence

- ID: quickops-confirmation-and-policy
- Group: safety
- Current manifest status: pending
- Visual artifact required: yes
- Collect:
  1. Trigger every requireConfirm QuickOps Flow target and capture the real confirmation UI before execution.
  2. Attempt high-risk operations such as true port kill or bulk file mutation and capture blocked/unavailable policy behavior.
  3. Capture enterprise or admin policy disabled states when available.
- Attach artifacts:
  - evidence/quickops/confirm-keep-awake.png
  - evidence/quickops/confirm-temp-file.png
  - evidence/quickops/confirm-cancel.png
  - evidence/quickops/policy-disabled.png
- Required checks before passing:
  - Every requireConfirm target shows a real user confirmation surface before execution
  - Confirm and cancel paths are both captured for at least one state action and one file action
  - True port kill remains disabled or separately gated by high-risk policy
  - Bulk rename, file cleanup, and long-term system settings changes remain unavailable by default
  - Enterprise policy can disable QuickOps tools without removing diagnostic visibility
- Keep blocked when:
  - Only Flow target metadata is attached instead of a real confirmation UI.
  - A high-risk operation can execute without an explicit confirmation and policy gate.
  - Policy disabled state hides degraded/diagnostic reason from the user.

### SDK and transport surface evidence

- ID: quickops-sdk-transport-surface
- Group: safety
- Current manifest status: pending
- Visual artifact required: no
- Collect:
  1. Run `pnpm -C "apps/core-app" run quickops:surface:audit -- --output "evidence/quickops/sdk-transport-surface.json" --strict`.
  2. Run a source audit across QuickOpsModule, QuickOps transport events, transport domain SDK, plugin SDK facade, and TouchPlugin runtime facade injection.
  3. Run the focused QuickOpsModule typed transport surface regression and transport domain SDK mapping tests.
  4. Attach a packaged or app-runtime probe showing plugin calls use quickOps/plugin.quickOps facade instead of private IPC.
- Attach artifacts:
  - evidence/quickops/sdk-transport-surface.json
  - evidence/quickops/sdk-facade-audit.txt
  - evidence/quickops/quickops-transport-tests.txt
- Required checks before passing:
  - QuickOpsModule registers only canonical QuickOpsEvents typed transport handlers
  - QuickOps Flow targets are registered through flowTargetRegistry under the quickops plugin id
  - Exactly one quickops Flow delivery handler is registered for built-in QuickOps targets
  - Plugin SDK QuickOps facade is read-only and does not expose stateful or destructive execution helpers
  - TouchPlugin runtime quickOps facade exposes the same read-only method set and invokes only QuickOpsEvents typed transport
  - No QuickOps public path uses regChannel, ipcMain, @main-process-message, @plugin-process-message, or raw quick-ops string channels
  - Artifacts include the command output or probe trace used to establish the channel audit
- Keep blocked when:
  - Only an allowlist is attached without current command output or runtime probe evidence.
  - Plugin examples call private IPC or transport event strings directly.
  - A stateful or high-risk QuickOps operation is exposed through the plugin SDK or TouchPlugin runtime facade.

### Flow and AI action adapter evidence

- ID: quickops-flow-ai-adapter
- Group: automation
- Current manifest status: pending
- Visual artifact required: yes
- Collect:
  1. Run `pnpm -C "apps/core-app" run quickops:flow-ai:audit -- --output "evidence/quickops/flow-ai-adapter-audit.json"` and keep the JSON artifact attached.
  2. Run structured Flow dispatch for every QuickOps target and capture acknowledgments, degraded paths, and consent/confirmation behavior.
  3. Run AI natural-language QuickOps requests and capture target selection, parameter extraction, confirmation, execution, and error recovery.
  4. Capture logs or trace output proving no high-risk target is auto-executed from AI text without confirmation.
- Attach artifacts:
  - evidence/quickops/flow-ai-adapter-audit.json
  - evidence/quickops/flow-targets.json
  - evidence/quickops/ai-action-adapter.png
  - evidence/quickops/ai-high-risk-blocked.png
- Required checks before passing:
  - Structured Flow dispatch covers read-only, stateful, file-writing, notification, clipboard, and folder-open targets
  - AI natural-language adapter maps user text to the intended QuickOps target and parameters
  - AI requests that imply high-risk actions stop at confirmation or blocked policy state
  - Degraded acknowledgments are visible and recoverable
  - Trace output links request, selected target, confirmation state, and final result without leaking sensitive content
- Keep blocked when:
  - Only direct SDK/focused test output is attached.
  - Natural-language AI execution skips target selection or confirmation evidence.
  - Trace output leaks file contents, clipboard contents, or unredacted private paths.

## 3. Verify Manifest

After collecting artifacts and updating the manifest, run:

```bash
pnpm -C "apps/core-app" run quickops:evidence:verify -- --input "evidence/quickops-smoke/quickops-evidence-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireExistingArtifacts --requireNonEmptyArtifacts
```

The verifier parses structured source-level artifacts for SDK/transport and Flow/AI cases; screenshot, recording, packaged runtime, platform, and confirmation UI artifacts must still come from the current real environment.

