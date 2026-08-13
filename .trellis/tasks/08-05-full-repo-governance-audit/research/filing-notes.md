# Filing notes (durable — read before the real `gh issue create` run)

Captured from peer coordination + spot-verification. These override defaults where they conflict.

## Verification status
- Spot-checked 5 of peer a2's 38 findings against source (system-shell-handlers.ts:77,
  renderer/index.html:11, touch-window.ts:93, electron-builder.yml:118, meta-overlay.ts:124) —
  all files/lines/evidence matched. Peer batch trusted; still dedup + sanity per finding.
- Peer used `confidence: high|medium|low` instead of `confirmed|plausible`. Treat `high` as
  confirmed. Explicitly-low ones need a repro or a `question` label (see F20).

## Special-handling items (peer a2)
1. **Exploit chain — file 4 links individually + ONE tracking issue that cross-links them.**
   The user wants individual issues, so keep them individual, but add a tracking/epic issue
   ("[audit/security] Tracking: renderer/plugin → arbitrary local code execution chain") that
   references the 4 issue numbers after they're filed. Fixing one link alone does not close it.
   Links:
   - renderer/index.html:11 — CSP effectively disabled (`script-src * 'unsafe-inline' 'unsafe-eval'`)
   - preload/index.ts:139 — full ipcRenderer bridged into page world
   - packages/utils/transport/sdk/main-transport.ts:710 — every handler bound to PLUGIN channel, no default deny
   - apps/core-app/src/main/channel/system-shell-handlers.ts:77 — system.executeCommand/openApp → shell on unvalidated string
   - (compounding) apps/core-app/src/main/modules/addon-opener.ts:239 — arbitrary file write via unsanitized `name` in path.join
2. **F20 (precore.ts:216, single-instance guard vs whenReady) is confidence:low, NOT run.**
   Either verify by repro, or file with `question` label + explicit "needs repro" note. Do NOT
   present it as confirmed. Do not count it toward the "confirmed" total.
3. **Framing / maintainer goodwill.** The window-security layer is genuinely well-built
   (`core/window-security-profile.ts` force-strips caller overrides of sandbox/contextIsolation/
   webSecurity/nodeIntegration/webviewTag; `plugin/runtime/plugin-window-policy.ts:534-566` is a
   thorough per-plugin isolation layer). The real finding is that the *capability surface behind it*
   wasn't narrowed to match. Keep issue bodies accurate and non-alarmist.

## Dedup targets
- Peer a2 "spilled" into `packages/utils/transport/` (main-transport.ts, port-handoff.ts) and
  `src/main/channel/{common,system-shell-handlers}.ts`. These overlap with:
  - `audit-sdk` (also audits packages/utils/transport)
  - `audit-security` (also audits IPC/channel/preload/webPreferences)
  - `audit-main-modules` (channel/common)
  Run the near-dup manual scan on security + transport findings before filing; keep highest severity.

## Peer audit-security (23 findings, security.jsonl) — coordination
- **Known cross-agent dup:** audit-security's #1 ("plugin channel not isolated: transport.on
  registers every handler on the plugin channel too", main-transport.ts:710) is the SAME defect
  as peer-a2's #2 (main-transport.ts:710), which was filed in the background run. consolidate's
  pass-2 (same file+line, title overlap) + ledger-preference now merges these so the mop-up won't
  re-file it. Verify no dup lands for main-transport.ts:710.
- audit-security #4 (markdown-sanitizer.ts href/src `/`-separator bypass) was **empirically tested**
  (regex executed): `<a/href="javascript:alert(1)">` passes through; feeds v-html for release notes
  + plugin-store READMEs. High-value, keep.
- **Framing (sound subsystems, deliberately NOT findings):** plugin-view webPreferences
  (sandbox+contextIsolation+per-view partition), plugin-window-policy navigation/resource
  confinement, secure-store.ts, plugin-sql-policy.ts, safe-path/safe-shell, compressing@2.1.1
  zip-slip guard, updater resolveVerifiedInstallTask (fails closed). Don't imply the app is broadly
  insecure — the finding is specific capability-surface gaps.
- security.jsonl (23) + security-2.jsonl (fresh replacement, ~6) overlap partially; dedup handles it.

## Reminder
- All issues carry `audit` label. Titles `[audit/<domain>] <summary>`.
- Report the TRUE filed count. No padding.
- Mop-up order: consolidate -> reconcile.mjs (title match vs live issues) -> filer (transient-retry).
