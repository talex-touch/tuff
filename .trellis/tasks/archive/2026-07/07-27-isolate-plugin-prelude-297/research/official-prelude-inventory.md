# Official Plugin Prelude Inventory

Research date: 2026-07-27

## Scope And Counting Correction

The delegated task says "24 manifests", but the current workspace does not contain 24
plugin manifests:

- `plugins/` contains **24 directories**.
- Only **22 directories contain `manifest.json`**.
- `touch-image` and `touch-music` are package-backed Surface-only directories with no
  manifest and no Prelude. They cannot create an activation in the current source tree.
- `pnpm plugins:validate` first reports `22 plugin manifests passed package policy`, then
  reports `Validating 24 plugins` and counts the two skipped Surface-only directories as
  passed. This is why the final line says `24/24 plugins passed validation`.
- There are **21 root `index.js` Prelude files**. `clipboard-history` instead declares
  `build.index.entry = index/main.ts`; that source is only `export {}` and its built
  `index.js` exports an empty module.

This inventory therefore has 24 directory rows, while migration/smoke activation gates
must use an explicit denominator of **22 manifests**. The two Surface-only rows have a
separate build-only smoke and must not be counted as successful isolated activations.

Evidence:

- `scripts/validate-plugin-package-policy.ts:13-47`
- `scripts/validate-plugins.mjs:92-125`
- `plugins/clipboard-history/manifest.json:19-27`
- `plugins/clipboard-history/index/main.ts:1`

## Current Injection Contract

The current main-process `TouchPlugin.getFeatureUtil()` constructs the injected context in
`apps/core-app/src/main/modules/plugin/plugin.ts:1922-2631`. The complete host-facing set is:

`dialog`, `logger`, `$event`, `openUrl`, `http`, `storage`, `secret`, `clipboard`, `channel`,
`touchChannel`, `permission`, `intelligence`, `voice`, `screenshot`, `system`, `i18n`,
`lexicon`, `divisionBox`, `meta`, `quickActions`, `flow`, `quickOps`, `power`, `recommend`,
`boxItems`, `features`, `plugin`, `plugins`, `TuffItemBuilder`, and `URLSearchParams`.

For the inventory below:

- `feature` means `plugin.feature`; `storage` means `plugin.storage`.
- `TIB` means `TuffItemBuilder` and is suitable for a child-local pure implementation.
- `sync host` identifies a call whose current code consumes a host return immediately. It
  must become an awaited typed capability or an immutable load snapshot.
- Even calls with no consumed return (`feature.clearItems`, most `feature.pushItems`) are
  host mutations and must be awaited after the hard cut. Current `pushItems` is already a
  Promise in main (`plugin.ts:2266-2269`), but most official Preludes discard it.
- `features.addFeature/removeFeature/getFeature/getFeatures`, `feature.getItems/updateItem/
  removeItem`, `clipboard.readText/writeText`, `plugin.getLocale`, and `plugin.box.hide` are
  the main synchronous compatibility hazards.
- `logger` should be child-local or a fixed redacted telemetry capability. It must not carry
  arbitrary Error/path/payload objects into main.

## Cross-Plugin Findings

### Privileged Direct Access

| Surface | Current root Preludes | Required migration |
| --- | --- | --- |
| `node:fs`, `node:fs/promises` | batch-rename, browser-data, workspace-scripts | Typed filesystem capability; no child direct import |
| `node:sqlite` | browser-data | Typed read-only browser-history/SQLite capability, main-owned temp-copy cleanup |
| `node:child_process` | browser-open, snipaste, window-manager, window-presets | Fixed process/system action capabilities |
| safe-shell wrapper (still process authority) | quick-actions, system-actions, workspace-scripts | Fixed allowlisted action/process capability |
| raw `globalThis.fetch` | browser-open | Typed HTTP capability with permission, host allowlist and cancellation |
| mutable/read-wide `process` | browser-data, quick-actions, snipaste, system-actions, window-manager, window-presets, workspace-scripts | Frozen platform/arch/selected-env snapshot; cwd only through explicit capability where needed |
| `node:os` | browser-data, browser-open | Snapshot or narrowly typed host discovery capability |
| Electron direct import | none found | Keep denied by child require policy |
| worker threads/runtime internals | none found | Keep denied by child require policy |
| explicit native `.node` addon | none found | Keep denied; `node:sqlite` is nevertheless privileged native-backed access |

### Callback, Cancellation And Resource Hazards

- `touch-dictation` passes `onData`, `onError`, and `onEnd` functions to
  `plugin.voice.asrStream` (`index.js:75-112`). It receives no retained disposer/controller,
  has no lifecycle `AbortSignal`, and exports no `onClose`; disable can leave a main-owned
  stream/callback live.
- `touch-intelligence` passes five callbacks to `client.contextStream`, retains a returned
  controller with `cancel()`, and stores it in a per-feature session (`index.js:1555-1710`).
  Supersession is modeled, but lifecycle disable/reload is not: there is no `onClose` and
  `onFeatureTriggered` does not accept the host `AbortSignal`.
- `touch-browser-open`, `touch-snipaste`, `touch-text-tools`, and `touch-translation` accept
  lifecycle `AbortSignal`. Browser-open and translation create linked child controllers;
  snipaste/text-tools only check `signal.aborted` at entry.
- Translation debounce timers/controllers are kept in Maps and are not cleared by an
  exported teardown lifecycle. Its detached DivisionBox session is a main-owned resource.
- No official root Prelude currently registers a long-lived channel subscription. Snippets,
  translation, and intelligence use request/reply `touchChannel.send`; generated
  intelligence/translation bundles contain transport stream machinery, so the runtime
  require/bundle policy must still prevent arbitrary channel registration.

### Pure/Allowlisted Child Modules

- Safe child-local candidates: `node:path`, `node:crypto`, `node:buffer`, text encoding,
  `URL`, `URLSearchParams`, timers, and `pinyin-pro` (pure transliteration).
- `node:os` and `node:process` are not pure authority-free imports; inject a frozen platform
  snapshot instead.
- `@talex-touch/utils/plugin/widget`, translation normalization helpers, intelligence request
  DTO builders, and transport event-name constants can be bundled as reviewed pure code or
  replaced by frozen constants. Do not runtime-allowlist their broad package roots.
- `@talex-touch/tuff-intelligence/client` is transport-bearing, and safe-shell helpers are
  process-bearing. Neither belongs on the pure-module allowlist.

## 24-Directory Inventory

### Batch A: Empty And Compatibility Shells

| Directory | Manifest / Prelude | Injected globals and host SDK | Sync return / events | Direct privilege / pure modules | Migration |
| --- | --- | --- | --- | --- | --- |
| `clipboard-history` | Manifest yes; no `main`; source `index/main.ts` is empty; built Prelude is empty | None | No lifecycle exports | No direct privilege | Keep an empty lifecycle, but still create one utility process per activation and run load/init/disable barriers |
| `touch-code-snippets` | `index.js`; retired, `onInit` only | `logger` | No consumed host return | None | Keep compatibility init in isolated child or remove plugin in a separately approved cleanup |
| `touch-text-snippets` | `index.js`; retired, `onInit` only | `logger` | No consumed host return | None | Same as code-snippets |
| `touch-image` | **No manifest, no Prelude** | N/A | N/A | Surface-only Vite app | Exclude from activation denominator; retain build-only verification |
| `touch-music` | **No manifest, no Prelude**; has renderer `preload.js`, not a plugin Prelude | N/A | N/A | Surface-only Vite app; renderer preload is a separate security surface | Exclude from activation denominator; retain build/preload verification |

### Batch B: Pure Compute And Invoke-Only SDK

| Directory | Prelude globals / SDK use | Sync host dependencies | Privilege, cancel, pure modules | Migration |
| --- | --- | --- | --- | --- |
| `touch-dev-utils` | `plugin`, `clipboard`, `logger`, `permission`, `TIB`; feature items + clipboard copy | Unawaited feature clear/push; clipboard is already awaited | Pure `node:buffer`, `node:crypto.randomUUID`; no cancel | Child-local transforms; awaited `feature.items.replace` and typed clipboard write |
| `touch-emoji-symbols` | Same feature/permission/clipboard shape | Unawaited feature clear/push; clipboard awaited | Static data only | Child-local search/rank + awaited feature/clipboard capabilities |
| `touch-text-tools` | Same plus `plugin.box` | Unawaited feature clear/push and `plugin.box.hide()`; clipboard awaited | Pure buffer/crypto; lifecycle signal is checked once | Child-local codec/hash; awaited feature, box and clipboard calls; cancellation test for stale trigger |
| `touch-quickops` | `plugin`, `logger`, `TIB`, `quickOps`, `flow` | Unawaited feature clear/push; quickOps/flow calls are awaited | No direct require; no callback/subscription | Fixed QuickOps read IDs, preview-save ID and flow-dispatch ID; await item writes |

### Batch C: Async Storage, Registry And Request/Reply

| Directory | Prelude globals / SDK use | Sync host dependencies | Privilege, cancel, pure modules | Migration |
| --- | --- | --- | --- | --- |
| `touch-dev-toolbox` | `plugin`, `logger`, `TIB`, `openUrl`, `permission`; storage init/read/openFolder | Unawaited feature clear/push; storage/openUrl already awaited | URL parsing only | Typed storage/open-folder/open-url plus awaited feature item writes |
| `touch-browser-bookmarks` | `plugin`, `clipboard`, `logger`, `TIB`, `permission`, `openUrl`; two storage files | Unawaited feature clear/push and `clipboard.writeText`; openUrl/storage awaited | No direct require | Await clipboard; typed storage/open-url; preserve optional network/clipboard permission decisions per call |
| `touch-snippets` | `plugin`, `clipboard`, `logger`, `TIB`, `permission`, `http`, `touchChannel`; storage, CloudShare HTTP, auth token request/reply | Unawaited feature clear/push; clipboard/storage/http/channel already awaited | Pure `node:crypto.randomUUID`; no subscription/cancel | Fixed HTTP routes or bounded generic HTTP capability, fixed auth-state capability, typed storage/clipboard; never expose raw channel names from child authority |

### Batch D: Callback, Stream And Abort Semantics

| Directory | Prelude globals / SDK use | Sync host dependencies | Callback/cancel/resource risks | Migration |
| --- | --- | --- | --- | --- |
| `touch-dictation` | `plugin.voice`, `plugin.feature`, `clipboard`, `logger`, `TIB` | Synchronous `clipboard.readText()`, unawaited `clipboard.writeText`, unawaited feature item mutations | `asrStream` callback triplet; no signal, disposer or close lifecycle | Voice stream subscription resource ID + callback IDs + cancel token; async clipboard; teardown must stop ASR/TTS and reject late events |
| `touch-intelligence` | `plugin`, `clipboard`, `logger`, `TIB`, `permission`, `touchChannel`, `intelligence`, `features`; storage/history, auth request, dynamic commands, OCR/chat | Sync `features.*`, `feature.getItems/updateItem`; some feature mutations awaited, others sync; clipboard awaited | `contextStream` callbacks + returned cancel controller; no lifecycle signal/onClose; many session Maps | Fixed intelligence invoke/context/stream/model/memory IDs; owner-bound stream/controller; async dynamic feature registry; disable cancels all sessions and rejects deltas from old generation |
| `touch-translation` | Root legacy Prelude injects `plugin`, `clipboard`, `http`, `channel`, `logger`, `URLSearchParams`, `TIB`, `permission`; canonical TS uses `touchChannel` and bundled providers | Sync `feature.updateItem/pushItems`, `clipboard.writeText`, `plugin.box.hide`; storage/secret/http/divisionBox/channel are awaited | Lifecycle AbortSignal linked to debounce controller; timers/Maps and DivisionBox session have no teardown; root and built implementations differ | Choose `index/main.ts` as SoT, delete/replace legacy root drift, typed HTTP/intelligence/secret/storage/divisionBox, awaited item updates, owner-bound cancel and detached-session disposal |

### Batch E: Filesystem, SQLite, Process And System Actions

| Directory | Prelude globals / SDK use | Sync host dependencies | Direct privileged access | Migration |
| --- | --- | --- | --- | --- |
| `touch-batch-rename` | `plugin`, `dialog`, `logger`, `TIB`, `permission`; storage undo journal | Unawaited feature clear/push; dialog/storage awaited | `node:fs`, `node:fs/promises`; pure `node:path` | Typed stat/exists + transactional rename/undo capability; main owns rollback and validates paths/permissions each call |
| `touch-browser-data` | `plugin`, `clipboard`, `logger`, `TIB`, `permission`, `openUrl`; provider state + feature items | Sync provider-enabled/getItems/removeItem and clipboard write; item pushes unawaited | fs, os, path, process/env, `node:sqlite`; temp DB/WAL/SHM copies | Prefer purpose-built browser-data scan capability over raw fs/sqlite; main owns profiles, bounded rows, temp copies and cleanup; snapshot platform only |
| `touch-browser-open` | `plugin`, `clipboard`, `logger`, `TIB`, `permission`, `features`; storage, browser discovery/open, suggestions | Sync dynamic `features.*`, clipboard write, box hide; mixed awaited/unawaited item writes | child_process, os, raw fetch; linked AbortController | Split browser discovery/open and HTTP suggestion capabilities; async registry; process and request resources terminate on disable |
| `touch-quick-actions` | `plugin`, `logger`, `TIB`, `permission`, `dialog`, `features` | `onInit` is synchronous and consumes `features.getFeature/addFeature`; feature item writes unawaited | process platform + safe-shell process wrapper | Make `onInit` async; snapshot platform; fixed system-action IDs with confirmation and process ownership in main |
| `touch-snipaste` | `plugin`, `logger`, `TIB`, `permission`; storage config | Unawaited feature items; storage awaited | child_process spawn, path, global process/env; signal checked only before work | Fixed Snipaste action capability with executable discovery in main; process resource ID; abort/disable kills or detaches deterministically |
| `touch-system-actions` | `plugin`, `logger`, `TIB`, `permission`, `dialog`, `openUrl`; `plugin.system.showMainWindow` | Feature item writes unawaited; dialogs/system call awaited | process platform + safe-shell; pure `pinyin-pro` | Snapshot platform; fixed action IDs and native window action; retain pinyin child-local |
| `touch-window-manager` | `plugin`, `logger`, `TIB`, `permission`; recent-window storage | Feature item writes unawaited; storage awaited | child_process exec/spawn + process; AppleScript/PowerShell/open | Purpose-built enumerate/activate/snap/topmost/close/hide/quit/launch IDs; never accept script/command from child |
| `touch-window-presets` | `plugin`, `logger`, `TIB`, `permission` | Feature item writes unawaited | child_process execFile + process; PowerShell | Fixed preset/list-window capability; host computes/validates target windows and owns timeout |
| `touch-workspace-scripts` | `plugin`, `dialog`, `logger`, `TIB`, `permission`; storage config | Sync `plugin.getLocale`; feature item writes unawaited | fs/fsp/path/process/env/cwd + safe-shell | Locale/platform snapshot; typed choose-workspace/read-package-scripts/process-spawn IDs; cwd containment and process cleanup in main |

## Generated And Runtime Projections

Generated artifacts are security-relevant because packaged activation may not execute the
root source file that was reviewed.

| Plugin | Canonical source/build | Runtime projection finding |
| --- | --- | --- |
| clipboard-history | `index/main.ts` -> `dist/build/index.js` | `apps/core-app/tuff/modules/plugins/clipboard-history/index.js` has the same SHA-256 as canonical build; empty module |
| touch-translation | Root `index.js` differs from `index/main.ts`; canonical built hash starts `05b2a9d0` | `resources/bundled-plugins` matches canonical build; `tuff/modules/plugins` differs (`750e3320`) and uses sdkapi `260428` while source manifest is `260615` |
| touch-intelligence | Root source and canonical minified build differ as expected, but build hash starts `e2d1d476` | `resources/bundled-plugins` differs (`120805cb`); `tuff/modules/plugins` also differs (`8083b929`) and is version `1.0.3` vs canonical/resource `1.2.0` |
| touch-quick-actions | Root hash starts `2720db08` | `tuff/modules/plugins` differs (`da7e2625`) and directly bundles `node:child_process`, `node:process`, and `node:util` |

Only clipboard-history, touch-intelligence and touch-translation currently have
`plugins/<name>/dist/build/index.js` in the workspace. Production hard-cut validation must:

1. Build every package-backed official target from canonical source.
2. Scan both canonical build and every packaged/runtime projection for denied imports and
   legacy host APIs.
3. Assert byte/hash equality where the projection contract requires a direct copy.
4. Launch the exact packaged seed selected by CoreApp, not only `plugins/<name>/index.js`.
5. Reject a missing/stale projection; never fall back to a root main-process VM Prelude.

Relevant projection contract: `.trellis/spec/frontend/quality-guidelines.md:99-153`.

## Migration Order

1. **Batch A (3 activations + 2 non-activation surfaces):** establish empty lifecycle and
   counting rules with clipboard-history and the two retired manifests; prove image/music
   remain outside activation discovery.
2. **Batch B (4):** land child-local TIB/pure modules and generic awaited feature-item,
   clipboard, QuickOps and flow capabilities.
3. **Batch C (3):** add storage, open-url, bounded HTTP and fixed auth request/reply. This
   creates reusable adapters without introducing callback resources.
4. **Batch D (3):** land callback, stream controller, AbortSignal, timer and detached-window
   ownership. Do dictation first, intelligence second, translation last because translation
   consumes intelligence and has source/build drift.
5. **Batch E (9):** add narrowly typed filesystem/browser-data/process/system capabilities.
   Migrate purpose-built actions before generic process primitives; workspace-scripts is last
   because it legitimately needs structured executable/args/cwd semantics.

Batch completion means source, canonical build and packaged projections all pass the same
require-policy and isolated smoke. Root-only unit tests are insufficient.

## Universal Isolation Smoke Contract

For each of the 22 manifested plugins:

1. Enable with permissions/fixtures prepared; assert a unique utility-process PID, owner
   handle and activation generation, and awaited load + `onInit`.
2. Trigger one declared feature and await item/result publication. Invoke at least one real
   item action when the plugin has actions.
3. Exercise a denied permission or malformed capability request and prove the handler is not
   reached. Then exercise the granted path where platform support exists.
4. Disable while a call/stream/process is pending when applicable. Assert authority is
   invalidated first, pending work rejects with a stable code, callbacks/subscriptions/
   processes/windows/timers are disposed, and the child exit barrier settles.
5. Re-enable and assert new generation/key/handle/PID. Inject an old response/callback and
   prove it cannot update items or settle the new request.
6. Run the same smoke against canonical source mode and the packaged seed selected by the
   production build. Scan the loaded artifact for denied imports.

## Per-Directory Smoke Matrix

| Directory | Positive trigger/action smoke | Cancellation, denial and cleanup assertions |
| --- | --- | --- |
| clipboard-history | Enable empty Prelude; trigger `clipboard-history` webcontent route | Dedicated process still exists; disable/reload rotates PID/owner; no host calls/resources |
| touch-batch-rename | Temp files -> preview -> apply -> undo and verify names/content | Deny fs.read/fs.write; disable during rename; no partial temp names or old-generation journal completion |
| touch-browser-bookmarks | Initialize empty storage; add/query/open/copy a URL | Deny optional network/clipboard; disable during storage/open; no stale recent-url write |
| touch-browser-data | Synthetic Chromium Bookmarks + History DB -> rebuild/search/open/copy | Deny fs.read/fs.index; abort scan; temp DB/WAL/SHM removed; row/profile limits; no path in diagnostics |
| touch-browser-open | Register engine features; query mocked suggestions; default/specific open and copy | Deny network/shell; abort superseded fetch; disable kills open/discovery work and rejects stale suggestion results |
| touch-code-snippets | Enable and await retired `onInit` | Disable cleanly; no capabilities/resources; logger payload remains stable/redacted |
| touch-dev-toolbox | Empty storage init, query configured link, open link/config folder | Deny network; disable during storage/open; no late recent/config mutation |
| touch-dev-utils | Trigger UUID/JWT/query/case transform and copy output | Deny clipboard; abort stale trigger; only buffer/crypto pure imports admitted |
| touch-dictation | Mock ASR partial/final/end, deliver text; mock TTS from clipboard | Deny voice/clipboard; disable after partial cancels stream/TTS, releases callbacks, rejects late final/end |
| touch-emoji-symbols | Search Chinese/English symbol and copy | Deny clipboard; disable between item publish/action; old action cannot write clipboard |
| touch-image | Run Surface build only | Assert discovery finds no manifest and creates no activation/process |
| touch-intelligence | Init custom commands; stream text answer; OCR image; copy/replace result | Deny intelligence/clipboard; cancel after delta; dispose controller/callbacks/timers; late delta/end cannot update new generation |
| touch-music | Run Surface build/preload checks only | Assert discovery finds no manifest and creates no activation/process; renderer preload remains separately sandboxed |
| touch-quick-actions | Await dynamic feature init; list and run one safe action with confirmation | Deny shell; malformed/forged command ignored; disable kills process resource; old dynamic registry writes rejected |
| touch-quickops | Trigger capabilities/system info/file tool; save preview; dispatch one safe flow | Missing facade/flow fails closed; disable pending read/flow; no stale session/resource result |
| touch-snipaste | Init settings; list actions; launch a fake executable/action | Deny shell, invalid args/env; abort/disable process; process handle and callbacks released |
| touch-snippets | Init/search/save/copy with clipboard placeholder; list/publish/install mocked CloudShare pack | Deny clipboard/network/auth; cancel HTTP; sensitive pack blocked; no raw channel subscription/resource remains |
| touch-system-actions | List actions; confirm/run safe action; show main window | Deny shell/app-window; forged command rejected; disable process; old action cannot affect window |
| touch-text-snippets | Enable and await retired `onInit` | Same empty-resource/rotation assertions as code-snippets |
| touch-text-tools | Trigger Base64/URL/JSON/hash/case result and copy | Deny clipboard; abort before/during item publish; old generation cannot hide box or write clipboard |
| touch-translation | Run Google HTTP + intelligence provider, copy result, OCR/image DivisionBox | Deny network/AI/secret/window/clipboard; supersede debounce; disable cancels timers/HTTP/AI and disposes DivisionBox; run root and packaged artifact parity check |
| touch-window-manager | Fake enumerate -> activate/snap/topmost/close; persist recent window | Deny shell; reject forged platform/window/script; disable subprocess; no stale recent-window write |
| touch-window-presets | Fake Windows list -> two-column preset and cleanup | Deny shell; reject child-provided script; timeout/disable process; no cross-generation window action |
| touch-workspace-scripts | Select temp workspace, read package scripts, run structured command with cwd | Deny fs/shell; reject traversal/metacharacters; abort/disable process; no output/callback after exit barrier |

## Existing Test Baseline And Gaps

Root focused tests already exist for batch-rename, browser-data, browser-open, dev-utils,
emoji-symbols, quick-actions, quickops, snipaste, snippets, text-tools, translation,
window-manager, window-presets and workspace-scripts. They mostly test pure helpers and
permission fail-closed behavior in a same-process VM.

No root Prelude test currently exists for browser-bookmarks, code-snippets, dev-toolbox,
dictation, intelligence, system-actions, or text-snippets. Clipboard-history has UI tests but
no activation lifecycle test. None of the existing plugin-local tests proves dedicated
utility-process ownership, callback/resource disposal, generation rotation, or packaged
artifact parity.

## Migration Gate Checklist

- Use **22/22 manifests isolated**, not the validator's ambiguous `24/24` line.
- Also require **24/24 directory classification**: 22 activation manifests + 2 explicitly
  non-activation surfaces.
- Remove all seven process-capable paths, three fs paths, SQLite, and raw fetch from child
  source and every generated projection.
- Convert every host item/registry/clipboard/box/locale return dependency to awaited typed
  capability or frozen snapshot.
- Add owner-bound teardown for dictation, intelligence and translation resources before
  declaring official migration complete.
- Resolve translation source-vs-built divergence and all CoreApp projection drift before
  production smoke.
- `pnpm plugins:validate` currently also warns that `voice.dictation` is unknown and
  touch-dictation lacks explicit `searchProviders`; these are existing manifest-validator
  gaps, not proof that isolation is complete.
