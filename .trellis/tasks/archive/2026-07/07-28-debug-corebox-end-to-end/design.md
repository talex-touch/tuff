# Design: CoreBox end-to-end debugging

## 1. Flow map

```text
CoreBoxModule shortcut/onboarding
  -> WindowManager visibility/focus/bounds
  -> IpcManager typed event registration
  -> renderer useVisibility/useSearch/useKeyboard/useActionPanel
  -> CoreBox search.session stream
  -> SearchEngineCore request-scoped session/provider sink
  -> renderer merge/selection/render
  -> item.execute/action/activation
  -> plugin view or native action
  -> hide/deactivate/destroy cleanup
```

The investigation follows one request and one window lifecycle across these owners.
Search internals not reached by CoreBox behavior stay with the existing search audit.

## 2. Verification matrix

| Layer | Evidence |
| --- | --- |
| Static | Ownership, event pairs, sender identity, lifecycle/disposers, history/blame |
| Focused contract | CoreBox main tests, renderer hook tests, render/footer tests, transport tests |
| Full gate | CoreApp full Vitest, node/web typecheck, Vite build |
| Runtime | Disposable-profile packaged/preview Electron plus CDP/log/screenshot state |
| Platform | macOS runtime; Windows/Linux static/mock only |

A full-suite failure matching #323 is logged as known. A distinct runtime reproduction
may still become a new candidate only when fixing #323's broad test baseline would not
necessarily resolve the user-visible defect.

## 3. Runtime isolation

Prefer a locally built unpacked `.app`, because `app.isPackaged` keeps CoreApp's dev
polyfill from replacing the configured userData path. Launch through a repository-owned
probe or supervised process with:

- `TUFF_STARTUP_BENCHMARK_USER_DATA_DIR=/tmp/tuff-corebox-debug-<run>`
- synthetic `HOME` and `TUFF_FILE_PROVIDER_BASE_WATCH_PATHS`
- a fresh CDP port and bounded output directory
- no provider keys, login state, or automation-managed clipboard mutation

A complete launch is an explicit ask-before step: pause until the user confirms the
system clipboard has been manually replaced with non-sensitive synthetic text. Do not
read the pre-launch clipboard for verification and do not attempt backup/restore,
because macOS multi-format pasteboard contents cannot be preserved safely by this
audit.

The probe records target IDs, console/page errors, bounded process-log tails, DOM state,
window state, and screenshots. It terminates the process and removes userData in all
exit paths. Local unsigned packaging proves local runtime behavior only.

## 4. High-value probes

### Handler cardinality

Count `ITuffTransportMain.on` registrations by canonical event using actual
`main-transport` behavior. Invoke a harmless idempotent request and a side-effecting
request in isolation, then compare handler invocation and disposer counts. Confirm
whether main/channel/local lanes all duplicate or only selected lanes.

### Shortcut ordering

Capture the ordered sequence of `shortcutTriggered`, native show, `ui.trigger`,
renderer `onShow`, clipboard refresh, search dispatch, and post-show notification.
Run only after the user confirms a non-sensitive synthetic clipboard value; do not
record that value. Duplicate events without duplicate state transition are cleanup,
not a bug.

### Search and lifecycle

Exercise stale/foreign cancellation, rapid replacement, no-results shrink, reopen with
existing query, selection preservation after index commit, blur/pin focus grace,
plugin-view resize/focus, action execution, and destroy/re-register cleanup.

## 5. Evidence and stop conditions

Raw profiles/logs/screenshots remain temporary. `research/report.md` stores commands,
counts, statuses, hashes, redacted tails, and artifact locations; candidates use exact
commit links and source lines. Stop a probe if clipboard sanitization is unconfirmed,
it reaches personal data, requires a provider credential, mutates a non-disposable
profile, or cannot be supervised.

## 6. Classification

- Confirmed-new: reachable, repeatable, independently actionable, and not owned.
- Known/duplicate: acceptance boundary already exists.
- Environment-only: missing platform/binary/secret/local binding.
- Inconclusive: static suspicion or unstable reproduction.

No product files are changed in this child.
