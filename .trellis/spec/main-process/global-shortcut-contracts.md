# Global Shortcut Contracts

`ShortcutModule` (`main/modules/global-shortcon.ts`) owns every OS-level key Tuff registers. Bindings
live in `ShortcutStorage` (`utils/common/storage/shortcut-storage.ts`). Every change runs one pass,
`reregisterAllShortcuts`, which does five things in order:

1. `globalShortcut.unregisterAll()`.
2. Classify every record (disabled, trigger, missing runtime, invalid, in-app conflict).
3. Register the active ones: each record's own stored key, and nothing else.
4. Tell the user, once per launch, about a system default left without a key. No other key ever
   stands in for it.
5. Publish what changed.

Surfaces that print a key (tray, sidebar, command window, onboarding, settings, notices) read the
module's answer and never write a key in.

Covered elsewhere:

- Which commands may be global at all, and removing a retired id before the first pass: "CoreBox
  Shortcut Scope Integrity" in [../frontend/type-safety.md](../frontend/type-safety.md).
- Fire-and-forget delivery, and a broadcast dropped before its listener exists:
  [channel-transport-contracts.md](channel-transport-contracts.md) ("main process notifies a
  renderer"). `shortcon:changed` follows those rules.
- The same-hue ink recipe: [../frontend/tuffex-design-rules.md](../frontend/tuffex-design-rules.md).

Path prefixes: `shared/` = `apps/core-app/src/shared/`, `main/` = `apps/core-app/src/main/`,
`renderer/` = `apps/core-app/src/renderer/src/`, `utils/` = `packages/utils/`. R-numbers refer to
`.trellis/tasks/09-26-corebox-default-shortcut/prd.md`.

## Scenario: Defaults are declared once and migrate by value

### 1. Scope / Trigger

- Changing a default passed to `registerMainShortcut`, its `legacyDefaultAccelerators`,
  `shared/corebox-shortcut.ts`, `isRetiredDefault` or `normalizeAccelerator` (R1, R2).
- Shipping a new default for an existing id. Two moves have gone through this path:
  - CoreBox, `CommandOrControl+E` → `Alt+Space` (2026-09-26);
  - screenshot, `CommandOrControl+Shift+S` → `CommandOrControl+Shift+A`, earlier.

### 2. Signatures

```ts
// shared/corebox-shortcut.ts — the only place these values are written
COREBOX_TOGGLE_SHORTCUT_ID = 'core.box.toggle'
COREBOX_TOGGLE_DEFAULT_ACCELERATOR = 'Alt+Space'            // ⌥Space on macOS
COREBOX_TOGGLE_LEGACY_DEFAULT_ACCELERATORS: readonly string[] = ['CommandOrControl+E']
// nothing else: there is no stand-in key (see "No fallback")

// main/modules/global-shortcon.ts — ShortcutModule
registerMainShortcut(id, defaultAccelerator, callback, options?: {
  enabled?: boolean                              // a new record only; default true
  owner?: string
  legacyDefaultAccelerators?: readonly string[]
  unavailableNotice?: MainShortcutUnavailableNotice  // see "No fallback"
}): boolean                                      // false only when `id` is already registered this run
private isRetiredDefault(stored, defaultAccelerator, legacyDefaults?): boolean
private normalizeAccelerator(raw): string | null // spelling only: CmdOrCtrl → CommandOrControl,
                                                 // Ctrl → Control, Win → Super, Option → Alt off macOS;
                                                 // null when the key is Esc
const SYSTEM_SHORTCUT_AUTHOR = 'system'
```

Two callers:

- `main/modules/box-tool/core-box/index.ts`: registers after `windowManager.ensureCreated()`, with
  the legacy list and the no-key notice.
- `main/modules/screenshot-session/index.ts`: `screenshot.tool.start`, legacy
  `['CommandOrControl+Shift+S']`, no notice.

### 3. Contracts

- **Written once.** The id, default and legacy list are constants in
  `shared/corebox-shortcut.ts`. CoreBox, the tray, the sidebar and onboarding import them. Another
  `'Alt+Space'` literal is a copy that can drift from the key that is bound.
- **A missing record is created system-authored:** `accelerator` = the default, `type: MAIN`,
  `meta.author: 'system'`, `meta.enabled: options.enabled ?? true`.
- **The value decides, not the author.** A rebind in settings (`shortcon:update` → `updateShortcut`)
  keeps `meta.author === 'system'`, so the author field cannot tell a key the user chose from the
  default. A stored value migrates only when both hold:
  - it is system-authored;
  - after `normalizeAccelerator`, `isRetiredDefault` finds it equal to an entry of
    `legacyDefaultAccelerators`, and it is not the current default.

  Every other stored value is left alone.
- **Equal spelling, not equal key.** `CmdOrCtrl+E` and `commandorcontrol+e` are the stored
  `CommandOrControl+E` written another way, so they migrate. `Command+E` presses ⌘E on a Mac too,
  but it stays: the recorder writes `Command` / `Control` and never `CommandOrControl`, so a stored
  `Command+E` is a key somebody picked.
- **Permanent and idempotent.** `registerMainShortcut` writes the migration to the store
  (`updateShortcutAccelerator`) before its registration pass. A migrated value equals the current
  default, so it never matches a legacy entry again.
- **The return value is not the OS verdict.** `registerMainShortcut` returns `true` whether or not
  the OS accepted the key. To learn whether a key fires, read `getEffectiveAccelerator(id)` or the
  shortcut's status.
- **Defaults use Electron's cross-platform names:** `CommandOrControl`, `Control`, `Alt`, `Shift`,
  `Super`. Off macOS, a default spelled `Command+…` is renamed to `Super+…` on the next launch (see
  "Recorded modifier names"). From then on it no longer equals its own default, so it gets no
  migration and no notice.

### 4. Validation & Error Matrix

| Stored before `registerMainShortcut('core.box.toggle', 'Alt+Space', …)` | Stored after |
| --- | --- |
| no record | `Alt+Space`, author `system` |
| `CommandOrControl+E`, author `system` | `Alt+Space` |
| `CmdOrCtrl+E` or `commandorcontrol+e`, author `system` | `Alt+Space` |
| `Command+E`, author `system` | `Command+E` (the recorder's spelling, so the user's key) |
| `Command+K`, author `system` (rebound in settings) | `Command+K` |
| `CommandOrControl+E`, another author | `CommandOrControl+E` |
| `Alt+Space` | unchanged; nothing written |
| `id` already registered this run | returns `false`, logs a warning, writes nothing |

### 5. Good / Base / Bad Cases

- Good: a profile still on the old system `CommandOrControl+E` opens CoreBox with ⌥Space after the
  update. A profile rebound to `Command+K` keeps `Command+K`.
- Base: a fresh profile has no record, and the first registration writes `Alt+Space`.
- Bad: migrating every system-authored value overwrites every key rebound in settings.
- Bad: matching with `acceleratorsMatch` would also move a recorded `Command+E` on macOS.

### 6. Tests Required

- `main/modules/global-shortcon.test.ts` › "ShortcutModule CoreBox default, and CoreBox left
  without a key". A hoisted block pins `process.platform` to `darwin` before the import. Tests:
  - "moves a system binding still on the old ⌘E default to ⌥Space";
  - "leaves a key the user chose where it is";
  - "reads the old default through the normaliser, and only the old default": both other spellings
    migrate, and `Command+E` stays.
- The same file › "ShortcutModule runtime cleanup" › "migrates a persisted system default without
  overwriting a customized shortcut". This is the screenshot shape.
- `main/modules/box-tool/core-box/index.test.ts`:
  - "registers only core.box.toggle as enabled by default" (`'Alt+Space'`);
  - "moves the old ⌘E default to ⌥Space, and asks for a notice rather than a stand-in": pins the
    legacy list and the four notice keys, and that the options carry nothing else.

### 7. Wrong vs Correct

```ts
// Wrong: raw equality misses `CmdOrCtrl+E`; checking the author alone rewrites keys rebound in settings
if (stored.meta.author === 'system' && stored.accelerator === 'CommandOrControl+E') migrate()
if (stored.meta.author === 'system') migrate()

// Correct: system-authored AND, after normalising, equal to a retired default
if (
  existingShortcut.meta?.author === SYSTEM_SHORTCUT_AUTHOR &&
  this.isRetiredDefault(existingShortcut.accelerator, defaultAccelerator, options?.legacyDefaultAccelerators)
) {
  this.storage!.updateShortcutAccelerator(id, defaultAccelerator)
}
```

```ts
// Wrong: the same key typed in two places, free to drift apart
shortcutModule.registerMainShortcut('core.box.toggle', 'Alt+Space', toggle)
const beforeMainAnswers = 'Alt+Space' // Done.vue

// Correct: one constant, imported by the module that binds it and by every surface that needs it
shortcutModule.registerMainShortcut(COREBOX_TOGGLE_SHORTCUT_ID, COREBOX_TOGGLE_DEFAULT_ACCELERATOR, toggle, options)
```

## Scenario: What a refused registration means on each OS

### 1. Scope / Trigger

- Code that treats the result of `globalShortcut.register` as evidence about other apps:
  - the settings status (`register-failed` / `register-error`);
  - the notices;
  - copy saying a key is "taken";
  - any proposed native conflict probe.
- Picking a default that other apps also ship on:
  - ⌥Space is Raycast's, Alfred's and ChatGPT.app's on macOS;
  - Alt+Space is PowerToys Run's on Windows.

### 2. Signatures

```ts
globalShortcut.register(accelerator, callback): boolean   // can also throw
// status after a pass (ShortcutStatus, main/modules/global-shortcon.ts)
{ state: 'unavailable', reason: 'register-failed' }       // returned false
{ state: 'unavailable', reason: 'register-error' }        // threw
```

- macOS: Electron registers through Carbon, `RegisterEventHotKey(…, options = 0, …)`. It never
  passes `kEventHotKeyExclusive`.
- Windows: `RegisterHotKey`, which fails for a hotkey another application has registered.

### 3. Contracts

Measured on macOS 27 with Electron 41.10.4 on 2026-09-26, and re-run while this spec was written. The
C probe called `RegisterEventHotKey(kVK_Space, optionKey, …)`, and each process ran its own event
loop (`RunCurrentEventLoop` in C, `app.whenReady()` in Electron).

| First registrant | Later registrant, another process | Result for the later one |
| --- | --- | --- |
| non-exclusive | non-exclusive | `noErr` (two Electron apps: `register('Alt+Space')` is `true` in both) |
| non-exclusive | exclusive | `noErr` |
| exclusive | non-exclusive | `noErr` |
| exclusive | exclusive | `-9878` (`eventHotKeyExistsErr`) |

Four more results:

- In one process, a non-exclusive registration after an exclusive one on the same key → `-9878`.
- Electron refuses a key the same process has already registered, however it is spelled:
  - `Alt+Space`, then `Option+Space` → `true`, then `false`;
  - `CommandOrControl+Alt+Shift+F13`, then `Command+Alt+Shift+F13` → `true`, then `false`.
- With Spotlight's ⌘Space enabled (symbolic hotkey 64), `register('Command+Space')` → `true`.
- A second Electron process got `true` for `CommandOrControl+E` while a running Tuff held it.

What that means:

- **On macOS, a `false` is not about other apps.** Electron's non-exclusive registration succeeded
  against every other process in the table, exclusive or not, and against Spotlight. In every case
  measured, `false` meant this process had already registered that key.
- **On Windows, `false` does mean another app holds the key.** This is the case the no-key notice is
  written for: PowerToys Run on Alt+Space leaves CoreBox without a key (next scenario).
- **Linux was not probed.** Document no behaviour for it until someone measures it.
- **A macOS conflict is invisible to Tuff.** Nobody measured which app a press reaches while another
  app also holds ⌥Space, and nothing in the registration reports the overlap. The only thing the user
  sees is another app opening. The product answers with a sentence instead of a detector (R6):
  - `beginner.done.shortcut.conflictHint`, under the key caps in
    `renderer/views/base/begin/internal/Done.vue`, on every platform, whatever key is shown;
  - the same sentence in `apps/nexus/content/docs/guide/start.{zh,en}.mdc`.
- **An exclusive native probe (for example through tuff-native) does not fix it.** Two reasons:
  - An exclusive registration only fails against another exclusive holder (last table row), so it
    misses a non-exclusive Raycast, Alfred or ChatGPT.
  - An exclusive registration held in this process makes Electron's own non-exclusive
    registration of that key fail.

### 4. Validation & Error Matrix

| Situation | `register` | Status | What the user hears (next scenario) |
| --- | --- | --- | --- |
| macOS, Raycast / Alfred / ChatGPT hold ⌥Space | `true` | `active` | nothing from the registration; the onboarding hint is the only signal |
| macOS, another Tuff binding on the same key, spelled differently (`Option+Space` beside `Alt+Space`) | not called for the later one | `conflict` (classified before registering; next scenario) | the no-key notice naming the other binding, if CoreBox's default is the one that lost |
| Windows, PowerToys Run holds Alt+Space | `false` | `unavailable` / `register-failed` | the no-key notice ("couldn't be registered"); no other key |
| any platform, `register` throws | — | `unavailable` / `register-error` | the same notice |
| Linux | not probed | — | — |

### 5. Good / Base / Bad Cases

- Good, macOS: ⌥Space opens ChatGPT instead of CoreBox. The onboarding page tells the user to change
  the key in settings.
- Good, Windows: PowerToys Run holds Alt+Space. CoreBox has no key this run, the user gets one
  notice saying the default couldn't be registered and where to pick another, and settings shows the
  row as not registered.
- Base: macOS with nothing else on ⌥Space. The status is `active`, no notice is shown, and every
  surface prints ⌥Space.
- Bad: copy, a comment or a status saying ⌥Space "is taken by another app" because `register`
  returned `false` on macOS.
- Bad: promising that Tuff tells a Raycast user their key is taken. On macOS nothing reports it.

### 6. Tests Required

- A unit test cannot observe another process, so `main/modules/global-shortcon.test.ts` fakes the
  refusal. Its `installRegisterMock(refused)` refuses the listed accelerators, as Windows does for a
  held key. Like Electron, it also refuses any accelerator the process already holds, until
  `unregisterAll`.
- `renderer/views/base/begin/internal/Done.test.ts` › "warns under the keys on %s that another app may
  already answer them" (darwin, win32, linux).
- After an OS or Electron upgrade, re-run the table: two processes, each with an event loop, plus
  the in-process spelling pair.

### 7. Wrong vs Correct

```ts
// Wrong: a promise macOS never keeps
/** Tells the user when Raycast or Alfred already holds ⌥Space. */

// Correct (shared/corebox-shortcut.ts)
/**
 * Windows refuses a key another app holds (PowerToys Run ships on Alt+Space). macOS does not:
 * Raycast or Alfred holding ⌥Space leaves Tuff's registration succeeding, so nothing reports the
 * overlap there.
 */
```

```ts
// Wrong: detect a macOS holder with an exclusive registration. It misses every non-exclusive
// holder, and while it is held it makes Electron's own registration of the key fail.
const taken = nativeProbe.registerExclusive('Alt+Space') === EVENT_HOT_KEY_EXISTS_ERR
```

```vue
<!-- Correct: nothing to detect; tell the user where they learn the key (Done.vue) -->
<small class="Done-ShortcutConflict">{{ t('beginner.done.shortcut.conflictHint') }}</small>
```

## Scenario: No fallback: CoreBox without a registered default shows one notice and no stand-in key

### 1. Scope / Trigger

- Changing any of: `announceUnavailableDefaults`, `isLeftWithoutKey`, `resolveUnavailableNotice`,
  `announceUnavailableDefault`, `resolveShortcutLabel`, `MainShortcutUnavailableNotice`, the
  `notifications.coreBoxShortcut*` copy, or the conflict grouping in `reregisterAllShortcuts` (R3 as
  decided on 2026-09-26: never fall back, everything is ⌥Space).
- Proposing a second key for a default ("a fallback", "a stand-in"). One was built and removed on
  2026-09-26: ⌘E / Ctrl+E ran CoreBox for any run in which the OS refused ⌥Space, with its own
  notice, an amber "注册失败，本次暂用 ⌘E" settings line and a holder check. Do not bring it back.
- Passing `unavailableNotice` for another shortcut.

### 2. Signatures

```ts
// main/modules/global-shortcon.ts
interface MainShortcutUnavailableNotice {
  titleKey: string              // 'notifications.coreBoxShortcutUnavailableTitle'
  refusedBodyKey: string        // 'notifications.coreBoxShortcutRefusedBody'
  conflictBodyKey: string       // 'notifications.coreBoxShortcutConflictBody'
  conflictNamedBodyKey: string  // 'notifications.coreBoxShortcutConflictNamedBody'
}
interface ShortcutStatus {           // mirrored in renderer/modules/channel/main/shortcon.ts
  state: 'active' | 'conflict' | 'unavailable' | 'disabled'
  reason?: 'conflict-system' | 'conflict-plugin' | 'register-failed' | 'register-error'
         | 'invalid' | 'runtime-missing' | 'disabled'
  conflictWith?: string[]            // a system record's conflict: the id that kept the key
  warnings?: ShortcutWarning[]
}                                    // no field for a second key
private announceUnavailableDefaults(shortcuts, statusMap): void  // after the main loop; registers nothing
private isLeftWithoutKey(status): boolean      // `conflict`, or `unavailable` + register-failed / register-error
private resolveUnavailableNotice(shortcut): MainShortcutUnavailableNotice | null
private announceUnavailableDefault(shortcut, status, notice): void
private resolveShortcutLabel(id?): string | null  // settingTools.shortcutLabels.<id>, or null without one
private announcedNotices: Set<string>  // shortcut ids; lives as long as the module, i.e. one launch

// the notice
notificationModule.showInternalSystemNotification({
  id: `shortcut-unavailable:${id}`, dedupeKey: `shortcut-unavailable:${id}`,
  title: t(titleKey, { shortcut }), message: t(bodyKey, params),
  level: 'error', system: { silent: false },
})
shortcut = acceleratorLabel(stored, process.platform)   // ⌥Space | Alt+Space
bodyKey, params = refused                                  → refusedBodyKey,       { shortcut }
                | conflict, the winner has a settings label → conflictNamedBodyKey, { shortcut, other }
                | conflict otherwise                        → conflictBodyKey,      { shortcut }
```

### 3. Contracts

- **Nothing stands in.** A default that cannot be had leaves the action with no key:
  - the pass registers each active record's own stored key and nothing else;
  - no status field names a second key;
  - `getEffectiveAccelerator` is the stored key while `active`, otherwise `null`;
  - the stored value is never touched, so the next pass and the next launch try the default again.
- **Two causes, one notice.** A binding is left without its key when:
  - the OS refused it: `unavailable` with `register-failed` (returned `false`) or `register-error`
    (threw);
  - it lost an in-app conflict: `conflict`. A system record loses only to a system record stored
    before it (`resolveConflictStatuses`). On a fresh profile the screenshot, voice and local AI
    records precede `core.box.toggle` (module load order), so giving one of them ⌥Space in settings
    is enough.

  `invalid`, `runtime-missing` and `disabled` are other stories and get no notice.
- **Only a system default qualifies.** All of these must hold:
  - `type === MAIN` and `meta.author === 'system'`;
  - the registration carries `unavailableNotice` and `defaultAccelerator`;
  - the stored value, which the pass has already normalised, equals
    `normalizeAccelerator(defaultAccelerator)`.

  A key the user chose that is refused or loses a conflict gets no notice: settings shows it on the
  row where they set it. CoreBox winning the conflict on its key is quiet too; the other record lost.
- **Once per launch and per shortcut, whichever cause.** The budget key is the shortcut id in
  `announcedNotices`, marked before the notice is shown. Every pass finds the binding keyless again
  (each module registering at startup runs one, and so does every settings edit), but the user hears
  it once. If the cause changes later in the run (refused, then lost to a conflict), the user
  already knows CoreBox has no key.
- **The copy says why, and blames no app.**
  - Refused: "无法注册" / "couldn't be registered", never "taken by another app": a refusal means that
    only on Windows (previous scenario).
  - Conflict: "已设给另一个快捷键" / "is assigned to another shortcut". When settings has a label for
    the winner (`settingTools.shortcutLabels.<id with . : - replaced by _>`, the key
    `SettingTools.vue` reads), the named body says which: "已设给「{other}」" / "is assigned to
    “{other}”". A winner without a label is not named; settings would print its raw id, which reads
    as noise in a sentence.
  - Every body ends by sending the user to Settings → Plugins & Tools → Shortcuts to pick another
    key.

  `renderer/modules/lang/shortcut-notices.test.ts` rejects "其他应用 / 别的应用 / 占用" and "another
  app / already used / taken / in use" in all four strings. It also checks `{shortcut}` in every
  body and `{other}` in the named one only, that these four are the only `coreBoxShortcut*` notices,
  and that none carries `{fallback}` or ⌘E / Ctrl+E.
- **A notice can never break a pass.** Everything after the budget check runs in a try/catch. A
  throw is logged as `Failed to show the no-key notice for <id>`, and since the id is marked
  already, it is not retried on the next pass.
- **Settings has no stand-in state.** A refused key reads `settingTools.shortcutStatus.unavailable`
  and a lost conflict `conflictSystem` / `conflictPlugin`, both in the status line's red (see
  "Settings status ink"). The stand-in line (`fallbackInUse`, "注册失败，本次暂用 {fallback}"), its
  amber tone (`statusTone`, `.is-warning`) and `--shortcut-status-warning` went with the stand-in.
- **In-app conflicts are grouped by the key pressed.** The classification loop in
  `reregisterAllShortcuts` puts a record into the first group whose key satisfies
  `acceleratorsMatch(grouped, normalized, process.platform)`, not into a group keyed by the
  normalised string:
  - macOS: `Option+Space` beside `Alt+Space`, or `Command+E` beside `CommandOrControl+E`, is one
    key, so the later record in storage order is a `conflict` and never reaches `register`;
  - Windows / Linux: `Super+E` beside `Command+E`, or `Control+K` beside `CommandOrControl+K`, is
    one key; `Command+J` beside `CommandOrControl+J` is two (the Windows key and Ctrl);
  - the conflict rules inside a group are unchanged (`resolveConflictStatuses`).

  Grouped by string, both spellings reached `register`, Electron refused the later one, and settings
  showed "registration failed" instead of the conflict. The notice would then have said "couldn't be
  registered" about what is a conflict.

### 4. Validation & Error Matrix

| Situation | Registered for CoreBox | Effective | Stored | Notice |
| --- | --- | --- | --- | --- |
| The OS refuses the system `Alt+Space` (`false`) | nothing | `null` | `Alt+Space` | refused body, once per launch; settings: `unavailable` |
| `register` throws on it | nothing | `null` | `Alt+Space` | refused body, once per launch |
| CoreBox's default loses an in-app conflict to a built-in shortcut stored before it that settings labels (the screenshot, say) | nothing | `null` | unchanged | named conflict body (「截图」 / “Take a screenshot”), once per launch; settings: the conflict |
| The same, and the winner has no settings label | nothing | `null` | unchanged | conflict body, once per launch |
| Refused, then lost to a conflict later in the run | nothing | `null` | unchanged | the refused notice only; not repeated |
| A key the user chose (for example `Command+K`) is refused or loses a conflict | nothing | `null` | unchanged | none; settings shows it |
| CoreBox wins the conflict on its key | `Alt+Space` | `Alt+Space` | unchanged | none |
| Showing the notice throws | unaffected | unaffected | unaffected | logged; counted as shown |

### 5. Good / Base / Bad Cases

- Good: Windows with PowerToys Run on Alt+Space. CoreBox has no key this run, and:
  - one notice appears ("CoreBox 暂无可用快捷键" / "默认快捷键 Alt+Space 无法注册…");
  - the tray, the sidebar and the command window's Open CoreBox row print no key;
  - settings reads "快捷键注册失败，可能被系统占用" in red;
  - the store still says `Alt+Space`, so the first launch after PowerToys quits is back on it.
- Good: the user gives ⌥Space to the screenshot in settings. CoreBox loses the conflict, and the
  notice names the screenshot ("默认快捷键 ⌥Space 已设给「截图」…").
- Base: macOS with Raycast on ⌥Space. The registration succeeds, so there is no notice (previous
  scenario); the onboarding hint is the only signal.
- Bad: a second key for the run. It teaches a key the user never chose, it can take a key a record
  later in storage order owns, and it was removed by decision.
- Bad: a notice per pass, or per cause. Every module registering at startup runs a pass.
- Bad: "taken by another app" in the refused copy.

### 6. Tests Required

`main/modules/global-shortcon.test.ts` › "ShortcutModule CoreBox default, and CoreBox left without a
key". `installRegisterMock(refused)` returns the callbacks it accepted, keyed by accelerator, and
`registeredAccelerators()` lists every accelerator handed to `register`. The fake `t` knows one
settings label, `screenshot_tool_start` → "Take a screenshot".

- "leaves CoreBox with no key when the OS refuses ⌥Space, and registers nothing in its place":
  - `register` saw `Alt+Space` and nothing else;
  - effective `null`; `getShortcutBinding` → `{ configured: 'Alt+Space', effective: null }`;
  - status exactly `{ state: 'unavailable', reason: 'register-failed' }`;
  - the store is untouched.
- "tells the user CoreBox has no key because ⌥Space could not be registered": one `error` notice,
  id `shortcut-unavailable:core.box.toggle`, the title and the refused body with
  `{"shortcut":"⌥Space"}`.
- "says the same when `register` throws".
- "tells the user once per launch, however many passes find ⌥Space refused again".
- "stays quiet when a key the user chose is refused".
- "names the built-in shortcut stored before CoreBox that takes ⌥Space":
  - the screenshot record precedes CoreBox's and is set to `Option+Space`;
  - CoreBox is `{ state: 'conflict', reason: 'conflict-system', conflictWith:
    ['screenshot.tool.start'] }`;
  - `register` saw `Option+Space` only, and it runs the screenshot;
  - the named body with `"other":"Take a screenshot"`, not repeated by a later pass.
- "says another shortcut holds ⌥Space when that one has no settings label".
- "tells the user once per launch, whichever way CoreBox loses its key".
- "finishes the pass when the notice throws, and does not show it again".
- "stays quiet when a key the user chose for CoreBox loses a conflict".
- "stays quiet when CoreBox wins the conflict on its key".

`main/modules/global-shortcon.test.ts` › "ShortcutModule reports two spellings of one key as a
conflict" (each case imports a fresh module and runs it on the platform it names):

- "on macOS flags Option+Space beside Alt+Space, and registers the key once": the later record is
  `{ state: 'conflict', reason: 'conflict-system', conflictWith: [first] }`, and `register` never
  sees `Option+Space`.
- "on %s groups the recorded spellings the way acceleratorsMatch reads them" (win32, linux): each
  pair's verdict equals `acceleratorsMatch`; `Super+E` / `Command+E` and `Control+K` /
  `CommandOrControl+K` conflict, `Command+J` / `CommandOrControl+J` do not.
- "leaves different keys alone": `Alt+Space`, `Alt+Shift+Space` and `Command+K` all stay active.

Elsewhere:

- `main/modules/box-tool/core-box/index.test.ts` › "moves the old ⌘E default to ⌥Space, and asks
  for a notice rather than a stand-in": the four notice keys, and no other option.
- `renderer/modules/lang/shortcut-notices.test.ts`: the copy contract above.
- `renderer/views/base/settings/SettingTools.shortcut-status.test.ts`: a refused CoreBox default
  reads `settingTools.shortcutStatus.unavailable`; one that lost a conflict reads `conflictSystem`.

### 7. Wrong vs Correct

```ts
// Wrong: a second key for the run, however carefully placed
if (!registered) {
  status.reason = 'register-failed'
  globalShortcut.register('CommandOrControl+E', run)
}

// Correct: the record's own key or none; after the main loop, only the notice
this.announceUnavailableDefaults(allShortcuts, statusMap)
```

```ts
// Wrong: one budget per cause, or a notice for any record left without its key
const announced = `${status.state}:${shortcut.id}`
if (status.state !== 'active') announce(shortcut)

// Correct: one budget per shortcut, and only for a system default still on its default
if (this.announcedNotices.has(shortcut.id)) return
const notice = this.resolveUnavailableNotice(shortcut) // null for a key the user chose
```

```ts
// Wrong: grouped by string, so `Option+Space` beside `Alt+Space` both reach `register`
const group = groupedByAccelerator.get(normalizedAccelerator)

// Correct: grouped by the key the platform presses
const group = [...groupedByAccelerator].find(([grouped]) =>
  acceleratorsMatch(grouped, normalizedAccelerator, process.platform)
)?.[1]
```

## Scenario: Every surface prints the effective key

### 1. Scope / Trigger

- Any surface that prints a global key (R4, R7):
  - the tray: `main/modules/tray/tray-menu-builder.ts` and `tray-manager.ts`;
  - the sidebar search entry: `renderer/components/shell/ShellSidebar.vue` → `ShellSearchEntry.vue`;
  - the main window's command window: `renderer/components/shell/MainWindowCommandPalette.vue`, and
    the Open CoreBox row in `renderer/modules/shortcuts/main-window-command-catalog.ts`;
  - onboarding: `renderer/views/base/begin/internal/Done.vue`;
  - the settings shortcut list: `SettingTools.vue` and `ShortcutDialogRow.vue`;
  - the notices.
- Changing `getEffectiveAccelerator`, `getShortcutBinding`, `onBindingsChanged`, `publishBindings`,
  `shared/events/shortcut-binding.ts`, `useCoreBoxShortcut` or `shared/accelerator-label.ts`.

### 2. Signatures

```ts
// shared/events/shortcut-binding.ts — defined once; main and renderer both import these objects
interface ShortcutBinding { configured: string | null; effective: string | null }
const shortconGetBindingEvent = defineRawEvent<{ id: string }, ShortcutBinding>('shortcon:get-binding')
const shortconChangedEvent = defineRawEvent<void, void>('shortcon:changed')   // broadcast, no payload

// main/modules/global-shortcon.ts — ShortcutModule
getShortcutAccelerator(id): string | null            // stored
getEffectiveAccelerator(id): string | null           // what fires `id` right now
getShortcutBinding(id): ShortcutBinding              // both; an empty id gives both null
onBindingsChanged(listener: () => void): () => void  // in-process listeners (the tray); returns the unsubscribe
private publishBindings(shortcuts, statusMap): void  // at the end of every pass

// renderer/modules/channel/main/shortcon.ts — shortconApi
getBinding(id): Promise<ShortcutBinding>
onChanged(handler: () => void): () => void

// renderer/modules/shortcuts/useCoreBoxShortcut.ts
useCoreBoxShortcut(): { binding: ShallowRef<ShortcutBinding | null>, effective, effectiveLabel, platform }

// renderer/modules/shortcuts/main-window-command-catalog.ts
interface MainWindowCommandDescriptor {
  // …id, labelKey, icon, group
  chord: ShortcutChord | null                            // null: a global key runs the command
  globalShortcutId?: typeof COREBOX_TOGGLE_SHORTCUT_ID
}
// open-corebox: { chord: null, globalShortcutId: COREBOX_TOGGLE_SHORTCUT_ID }
mainWindowCommandChordLabel(id, isMac): string | null  // null for an unknown id or a command with no chord

// shared/accelerator-label.ts — pure; `platform` is a process.platform value
acceleratorLabel(accelerator, platform, separator?): string  // ⌥Space, ⌘K | Alt+Space, Ctrl+K; unparseable → as written
parseAccelerator(accelerator, platform): ParsedAccelerator | null
acceleratorsMatch(a, b, platform): boolean
acceleratorMatchesEvent(parsed, event): boolean              // KeyboardEvent.code, exact modifiers
```

### 3. Contracts

- **Effective means what fires the action now:** the stored accelerator while `state === 'active'`
  (never for a `TRIGGER`, whose value is a gesture kind, not a key); otherwise `null`: disabled,
  refused, in conflict, or not registered yet. No other key can be effective, because nothing stands
  in (previous scenario).
- **Each event is defined once.** Both events live in `shared/events/shortcut-binding.ts`. Main
  registers `transport.on(shortconGetBindingEvent, …)` and calls `broadcast(shortconChangedEvent,
  undefined)`; the renderer's `shortconApi` uses the same objects. Two `defineRawEvent` copies of one
  name compile into separate Electron bundles, and a rename in one of them fails only at runtime,
  with `No handler registered`. These events serve the host renderer only; plugins cannot reach them.
- **Publish only a change.** `publishBindings` builds a signature, `[id, stored, effective]` for
  every shortcut:
  - equal to the previous one → return;
  - otherwise → call each in-process listener (each in its own try/catch), then broadcast
    `shortcon:changed`.

  Most passes change nothing a surface prints; every module registering at startup runs one.
  `teardownRuntimeRegistrations` resets the signature.
- **The push is empty; listeners ask.** `shortcon:changed` carries no payload, and each listener
  queries the ids it prints. The broadcast is fire-and-forget and is dropped when no listener exists
  yet (see channel-transport-contracts.md), so a renderer surface queries once at setup and again on
  every push.
- **The composable ignores stale answers.** `useCoreBoxShortcut` numbers each query (`latestRequest`)
  and drops any answer that is not the newest, or that arrives after its scope was disposed. A failed
  query keeps what is already shown. The push subscription is released with the calling effect scope.
- **The tray rebuilds on every change.** It is built before CoreBox and screenshot register their keys
  (`trayManagerModule` precedes both in `foregroundModulesToLoad`), and the keys move later (a
  rebind, a refusal, a lost conflict). The wiring:
  - `TrayManager.registerEventListeners` pushes
    `shortcutModule.onBindingsChanged(() => this.updateMenu())` into `eventDisposers`, which are
    released on destroy;
  - the Open CoreBox and Capture Now rows pass
    `getEffectiveAccelerator(COREBOX_TOGGLE_SHORTCUT_ID | SCREENSHOT_SHORTCUT_ID) ?? undefined`.
    That is an Electron accelerator, which Electron draws for the platform. When no key fires the
    action the row gets no accelerator (R7);
  - the two delayed-capture rows carry no accelerator.
- **What each surface falls back to:**

  | Surface | Prints | When there is no effective key |
  | --- | --- | --- |
  | tray (main) | `getEffectiveAccelerator(id)`, a raw accelerator | no accelerator on the row |
  | sidebar search entry | `useCoreBoxShortcut().effectiveLabel` | `kbd` is `undefined`, so `.ShellSearchEntry-Kbd` is not rendered (also while loading) |
  | command window, Open CoreBox row | `useCoreBoxShortcut().effectiveLabel` (the row has `globalShortcutId` and no chord) | no `TxKbd` on the row (also while loading) |
  | onboarding `Done.vue` | `configured ?? COREBOX_TOGGLE_DEFAULT_ACCELERATOR` | the stored key, which it still completes on; the default before main answers |
  | settings row | the stored accelerator in the recorder | the status line (`unavailable`, conflict, …) |
  | notices (main) | `acceleratorLabel(stored, process.platform)`, plus the winner's settings label for a conflict | — |

  A hint surface prints only a live key; a hint naming a dead key teaches a key that does nothing.
  The onboarding page teaches a key and listens for it, so it always names one: stored → default.
  With nothing standing in, the live key is the stored one or none, so an `effective` step in front
  of `configured` could never change what the page prints.
- **Open CoreBox has no in-window chord.** The main window bound ⌘E / Ctrl+E to Open CoreBox. The
  global key fires while the main window is focused too, so that chord only taught a second key: the
  very one CoreBox moved away from. The catalog row is `{ chord: null, globalShortcutId:
  COREBOX_TOGGLE_SHORTCUT_ID }`, and:
  - the capture layer skips it (`candidate.chord !== null && shortcutChordMatches(…)`), so ⌘E in
    the main window reaches the focused field and is not prevented;
  - `mainWindowCommandChordLabel` returns `null`, so no hint badge draws a key for it;
  - the command window prints `useCoreBoxShortcut().effectiveLabel` on the row, as the table says.
- **Onboarding completes on the key it teaches.** When the global registration does not consume the
  press, `Done.vue` matches the keydown with `acceleratorMatchesEvent(parseAccelerator(key,
  platform), event)`. That compares the physical `KeyboardEvent.code` and exact modifiers; on a Mac,
  ⌥Space puts U+00A0 in `key`. The old ⌘E no longer completes onboarding. When the global key does
  fire during onboarding, CoreBox's callback sends `CoreBoxEvents.beginner.shortcutTriggered` to the
  main window instead.
- **Labels come from `acceleratorLabel`, never from a literal.**
  - macOS: `⌥Space`, `⌘K`. Modifier glyphs `⌘⌃⌥⇧`, command first, no joiner.
  - Elsewhere: `Alt+Space`, `Ctrl+K`, and `Win+…` on win32 or `Super+…` on linux, joined with `+`.
  - `separator: ' + '` for running text (`⌥ + Space`).
  - An accelerator it cannot parse is printed as written.
  - Main passes `process.platform`; the renderer passes `useRendererPlatform().platform`.
- **Settings name every built-in row (R10).** `getShortcutLabel(id)` reads
  `settingTools.shortcutLabels.<id with . : - replaced by _>`, falling back to the raw id.
  `screenshot_tool_start` is "截图" / "Take a screenshot".
- **Static pages cannot read the binding (R5).** The Nexus quick start, the landing hero and
  `CLAUDE.md` name the default (`⌥Space` / `Alt+Space`) and say it can be changed in settings. The
  quick start also carries the conflict sentence (R6). None of them mentions a stand-in key.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| A pass changed no stored or effective key | no listener call, no broadcast |
| A rebind in settings, or a key refused, lost to a conflict or regained | one listener round and one broadcast for that pass |
| Recorder focused (`FlatKeyInput` calls `shortconApi.disableAll` on focus) | keys unregistered; status, effective key and signature keep the last pass; nothing published. `enableAll` on blur runs a pass. |
| Query for an unknown or empty id | `{ configured: null, effective: null }` |
| An older query resolves after a newer one | ignored |
| An answer arrives after the scope was disposed | ignored |
| A query rejects | the shown value is kept |
| A listener throws | logged; the other listeners and the broadcast still run |
| The broadcast throws | logged |

### 5. Good / Base / Bad Cases

- Good: on Windows with PowerToys Run, the pass leaves CoreBox without a key, and the tray, the
  sidebar and the command window print none, without a reload. When the user then rebinds CoreBox
  to Ctrl+K in settings, every surface prints Ctrl+K on that pass.
- Base: a fresh macOS install. Every surface shows ⌥Space, and the tray row uses Electron's own
  glyphs.
- Bad: a key written into a label. The tray's Capture Now row taught ⇧⌘S, which was neither the
  screenshot default (⇧⌘A) nor any rebind.
- Bad: the command window's own ⌘E on Open CoreBox while the global key is ⌥Space: two keys for one
  command, one of them the old default.

### 6. Tests Required

- `main/modules/global-shortcon.test.ts` › "answers the binding query and publishes only a pass that
  changed a key":
  - the handler is looked up by the shared event object, so a copy with the same name would not be
    found;
  - the answer is `{ configured, effective }`;
  - a change gives one listener call and one broadcast of `shortconChangedEvent`;
  - `enableAll` and a no-op update give none;
  - a rebind publishes.
- `renderer/modules/channel/main/shortcon.test.ts`: `getBinding` sends `shortconGetBindingEvent` with
  `{ id }`, and `onChanged` listens on `shortconChangedEvent`. Both are asserted by object identity,
  not by name.
- `renderer/modules/shortcuts/useCoreBoxShortcut.test.ts`:
  - labels `⌥Space` on darwin and `Alt+Space` on win32;
  - follows a push to a rebind (`⌘K`), and then to no key;
  - gives a `null` label when no key fires;
  - keeps the newest answer when an older one resolves last;
  - unsubscribes with the scope.
- `main/modules/tray/tray-menu-builder.test.ts`:
  - Open CoreBox prints the effective key (the default or a rebind), or nothing;
  - Capture Now prints the screenshot's effective key or nothing.
- `main/modules/tray/tray-manager.test.ts` › "rebuilds the menu when the key that opens CoreBox
  moves". It also checks that the listener is released on destroy.
- `renderer/components/shell/ShellSidebar.test.ts`: follows `⌥Space` → `⌘K`, and renders no
  `.ShellSearchEntry-Kbd` for `null`.
- `renderer/components/shell/MainWindowCommandPalette.test.ts`: the Open CoreBox row prints `⌥Space`,
  follows a rebind, and prints no `TxKbd` while no key is live (the row is still offered); an
  in-window chord still prints (`⌘,`).
- `renderer/modules/shortcuts/main-window-command-catalog.test.ts`: `open-corebox` has `chord: null`,
  `globalShortcutId: 'core.box.toggle'` and no badge; ⌘E on macOS and Ctrl+E elsewhere run nothing
  and are not prevented, while ⌘, / Ctrl+, still open settings.
- `shared/corebox-shortcut.test.ts`: the module exports the id, the default and the legacy list and
  nothing else; no display path (tray, composable, catalog, command window, sidebar, search entry,
  onboarding, key cap, settings, settings row) spells ⌘E / Ctrl+E / `CommandOrControl+E` /
  `code: 'KeyE'`, and neither does the copy around the key in either locale.
- `renderer/views/base/begin/internal/Done.test.ts` › "onboarding shortcut keys":
  - caps and hint for ⌥Space and for a rebind;
  - PC key names (`alt`, `ctrl`);
  - the stored key when none is live;
  - the conflict hint on all three platforms;
  - each held key lights up;
  - onboarding completes on ⌥Space (`code: 'Space'`, `key: '\u00A0'`), and not on ⌘E.
- `shared/accelerator-label.test.ts`:
  - per-platform labels, the separator, modifier order, key caps;
  - an unparseable accelerator passes through;
  - `acceleratorMatchesEvent` and `acceleratorsMatch`.
- `renderer/modules/lang/shortcut-labels.test.ts`: both locales name `core.box.toggle`,
  `core.omniPanel.toggle`, `core.omniPanel.mouseLongPress`, `screenshot.tool.start`,
  `voice.dictation.toggle` and `voice.quickEdit`.

### 7. Wrong vs Correct

```ts
// Wrong: a key written in, dead as soon as a rebind or a refusal moves the binding
const searchKbd = computed(() => (isMac.value ? '⌘E' : 'Ctrl+E'))
accelerator: 'Cmd+Shift+S' // tray: neither the screenshot default (⇧⌘A) nor any rebind

// Correct
const { effectiveLabel } = useCoreBoxShortcut()
const searchKbd = computed(() => effectiveLabel.value ?? undefined)
accelerator: shortcutModule.getEffectiveAccelerator(SCREENSHOT_SHORTCUT_ID) ?? undefined
```

```ts
// Wrong: the name defined a second time, in the renderer bundle
getBinding: defineRawEvent<{ id: string }, ShortcutBinding>('shortcon:get-binding'),

// Correct: import the shared object
import { shortconGetBindingEvent } from '../../../../../shared/events/shortcut-binding'
getBinding: shortconGetBindingEvent,
```

```ts
// Wrong: an in-window chord for a command the global key already runs
{ id: 'open-corebox', labelKey: 'shortcuts.commands.openCoreBox', …, chord: { code: 'KeyE' } }

// Correct: no chord; the command window prints the global key as it is bound now
{ id: 'open-corebox', labelKey: 'shortcuts.commands.openCoreBox', …, chord: null,
  globalShortcutId: COREBOX_TOGGLE_SHORTCUT_ID }
```

```ts
// Wrong: whichever answer arrives last wins
binding.value = await shortconApi.getBinding(COREBOX_TOGGLE_SHORTCUT_ID)

// Correct
const request = ++latestRequest
const next = await shortconApi.getBinding(COREBOX_TOGGLE_SHORTCUT_ID)
if (disposed || request !== latestRequest) return
binding.value = next ?? null
```

## Scenario: Recorded modifier names

### 1. Scope / Trigger

- Changing the settings recorder (`renderer/components/base/input/FlatKeyInput.vue`) or
  `useRendererPlatform` (R8).
- Changing `MAC_ONLY_MODIFIER_NAMES`, `renameMacOnlyModifiers`, `renameRecordedMacModifiers`, the
  order of steps in `ShortcutModule.onInit`, or `acceleratorTokenAlias` (R11).

### 2. Signatures

```ts
// renderer/components/base/input/FlatKeyInput.vue — formatAccelerator(event), called on keydown
const { isMac } = useRendererPlatform()   // ComputedRef<boolean>
const mac = isMac.value                   // read inside the handler, per keydown
// order: meta, ctrl, alt, shift, then the key
// metaKey → mac ? 'Command' : 'Super'   ctrlKey → 'Control'   altKey → mac ? 'Option' : 'Alt'   shiftKey → 'Shift'

// main/modules/global-shortcon.ts
const MAC_ONLY_MODIFIER_NAMES = new Map([['COMMAND', 'Super'], ['CMD', 'Super'], ['OPTION', 'Alt'], ['OPT', 'Alt']])
function renameMacOnlyModifiers(accelerator: string): string | null
private renameRecordedMacModifiers(): void
// onInit: new ShortcutStorage(useMainStorage()) → removeShortcuts(RETIRED_GLOBAL_SHORTCUT_IDS)
//   → renameRecordedMacModifiers() → before-quit listener → transport and IPC → reregisterAllShortcuts()
```

### 3. Contracts

- **The recorder reads `isMac.value` at keydown (R8).** `isMac` is a `ComputedRef`. Read bare, it is
  an object, which is always truthy, so the recorder used to store the Windows key as `Command` and
  Alt as `Option` on every platform. Electron documents `Command` as having no effect on Windows and
  Linux. What it writes now:
  - macOS: `Command` / `Option`;
  - Windows and Linux: `Super` / `Alt`, the names the main normaliser keeps;
  - `Control` and `Shift` on every platform;
  - never `CommandOrControl`.
- **Old recordings are renamed at startup, off macOS (R11).** `renameRecordedMacModifiers` rewrites
  `Command` / `Cmd` → `Super` and `Option` / `Opt` → `Alt`. This is needed because the pass's
  normaliser keeps `Command` as `Command` on every platform (it turns `Option` into `Alt` off macOS
  by itself). Its limits:
  - **Types:** only `ShortcutType.MAIN` (settings rows, app launches) and `ShortcutType.FEATURE`
    (keys the user bound to a plugin feature). `RENDERER` is excluded because it is the plugin's own
    spelling, and `registerRendererShortcut` writes it back on every load. `TRIGGER` is excluded
    because its value is a gesture kind, not a key.
  - **Platform:** never on macOS, where those are the right names. `isMacPlatform` is fixed when
    the module is imported.
  - **Cross-platform names:** `CommandOrControl` and `CmdOrCtrl` are never renamed.
  - **Left as they are:** `renameMacOnlyModifiers` returns `null` when there is nothing to rename,
    when there is no modifier, when the key token itself is spelled like a macOS modifier, or when
    renaming would duplicate a modifier (`Command+Super+E` → `Super+Super+E`). A value the user can
    still see and fix beats one silently rewritten into something else.
- **Each record is written on its own, with rollback.** `updateShortcutAccelerator` sets the value in
  memory before it saves, so a failed save leaves the new value in memory.
  - The catch puts the old value back. The restore also sets before it saves, so it gets its own
    empty try/catch: a failed write-back cannot throw out of `onInit`, where it would fail the
    shortcut module and, with it, startup.
  - A record whose write failed keeps its old value, in the store and in this run. The next
    record's save writes the whole store, with the old value in it, and the next launch tries again.
- **Idempotent.** A renamed value has nothing left to rename, so a second launch writes nothing.
- **Runs after the storage is built and before the first pass.** It needs `useMainStorage()`, so
  `shortcutModule` comes after `storageModule` in `foregroundModulesToLoad`. It runs before the first
  `reregisterAllShortcuts`, so a binding registers under its new name and never under the old one.
  FEATURE records register in that first pass, since they need no module.

### 4. Validation & Error Matrix

| Stored on win32 / linux | Type | After the launch |
| --- | --- | --- |
| `Command+E` | MAIN | `Super+E` |
| `Option+K` | FEATURE | `Alt+K` |
| `Command+Shift+O` | FEATURE | `Super+Shift+O`; registered only under that name, never as `Command+Shift+O` |
| `CommandOrControl+Shift+P`, `CmdOrCtrl+Alt+O` | MAIN | unchanged |
| `Command+Super+E` | MAIN | unchanged (renaming would give two Super keys) |
| `Command+X` | RENDERER (plugin) | unchanged |
| `mouse:right-long-press` | TRIGGER | unchanged |
| any value, on darwin | any | unchanged; nothing written |
| one record's save throws | — | that record keeps its old value, in memory and in the store; the others move |
| the save and the restore both throw | — | old value kept; `onInit` completes |
| a second launch | — | nothing written |

### 5. Good / Base / Bad Cases

- Good: a Windows user recorded Win+E before the R8 fix, so `Command+E` is stored, and Electron
  documents `Command` as having no effect on Windows. After the update the store reads `Super+E`,
  the key registers, and the settings row prints `Win+E`.
- Base: on macOS nothing is renamed, and the recorder keeps writing `Command` / `Option`.
- Bad: renaming plugin `RENDERER` values. The plugin writes its declared spelling back on the next
  load, so the store flips between two values on every launch.
- Bad: renaming after the first pass. That pass has already registered the old `Command+…` spelling.

### 6. Tests Required

- `renderer/components/base/input/FlatKeyInput.test.ts` › "FlatKeyInput modifier names". The
  `useRendererPlatform` mock returns real computed refs, because a mock returning a plain boolean
  would hide the bug. Cases:
  - win32 and linux `metaKey` → `Super+E`; darwin → `Command+E`;
  - `altKey` → `Alt+K` on win32, `Option+K` on darwin;
  - win32 `metaKey` + `shiftKey` + Space → `Super+Shift+Space`.
- `main/modules/global-shortcon.test.ts` › "ShortcutModule renames the macOS modifier names the
  recorder stored off macOS". `isMacPlatform` is read at import, so the module is re-imported per
  platform with `vi.resetModules()`. Cases:
  - on win32 and on linux, the whole store map from the table above;
  - `Super+Shift+O` and `Alt+K` are registered, and `Command+Shift+O` never is;
  - a second launch writes nothing;
  - darwin writes nothing;
  - one failed save keeps that record and still moves the rest;
  - when the save and the restore both fail, the module still starts.

### 7. Wrong vs Correct

```ts
// Wrong: the ComputedRef itself is truthy on every platform
if (event.metaKey) modifiers.push(isMac ? 'Command' : 'Super')

// Correct
const mac = isMac.value
if (event.metaKey) modifiers.push(mac ? 'Command' : 'Super')
```

```ts
// Wrong: every record, plugin spellings included, rewritten by substring.
// This also turns `CommandOrControl+E` into `SuperOrControl+E`.
for (const s of storage.getAllShortcuts()) {
  storage.updateShortcutAccelerator(s.id, s.accelerator.replace(/Command|Cmd/g, 'Super'))
}

// Correct: off macOS, MAIN / FEATURE only, token by token; CommandOrControl and duplicate modifiers left alone
if (shortcut.type !== ShortcutType.MAIN && shortcut.type !== ShortcutType.FEATURE) continue
const renamed = renameMacOnlyModifiers(shortcut.accelerator)
```

```ts
// Wrong: a failed write-back escapes onInit and takes startup down
} catch (error) {
  storage.updateShortcutAccelerator(shortcut.id, shortcut.accelerator)
}

// Correct: the restore sets before it saves, so its own failure is safe to swallow
} catch (error) {
  try {
    storage.updateShortcutAccelerator(shortcut.id, shortcut.accelerator)
  } catch {
    // Already restored in memory.
  }
  shortconLog.warn(`Could not rename ${shortcut.id}; kept ${shortcut.accelerator}`, { error })
}
```

## Note: Settings status ink (R9)

The settings status line (`.ShortcutDialog-StatusText` in
`renderer/views/base/settings/components/ShortcutDialogRow.vue`, 12px) reads its colour from three
custom properties.

Base rule (light themes, high contrast included):

```scss
--shortcut-status-danger:  color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--tx-text-color-primary, #303133));
--shortcut-status-success: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--tx-text-color-primary, #303133));
--shortcut-status-muted:   var(--tx-text-color-regular, #606266);
```

`.dark .ShortcutDialog-StatusText` (dark themes, high contrast included): the plain tokens,
`--tx-color-danger`, `--tx-color-success` and `--tx-text-color-secondary`. The dark themes stay as
they were, by decision (R9).

Which class uses which variable:

- the base rule (a key that does nothing: refused, in conflict, invalid) → danger;
- `.active`, `.disabled` and `.is-saving` → muted;
- `.is-success` → success;
- `.is-error` → danger.

Measured in Chromium (WCAG 2), in the order red / green / grey:

- before, light theme on `#ffffff`: 2.90 / 2.24 / 3.08 (grey was `secondary`);
- after, light theme on `#ffffff`: 5.66 / 5.61 / 6.11;
- after, light high contrast: 11.47 / 12.42 / 14.68;
- dark on `#1d1e1f`: 6.04 / 9.58 / 6.85;
- dark high contrast on `#111827`: 9.38 / 12.63 / 12.04.

The same numbers live in the SFC comment. Re-measure when a hue or ink token moves.

An amber `--shortcut-status-warning` and an `.is-warning` class once coloured the stand-in line
("注册失败，本次暂用 ⌘E"). They went with the stand-in (see "No fallback").

The percentages are tuffex's same-hue recipe, and grey sits on `regular` rather than `secondary`.
Both rules are in [../frontend/tuffex-design-rules.md](../frontend/tuffex-design-rules.md): "White
ink on a solid semantic fill is not a supported pairing" and "Resting ink for 13px text is
`regular`, not `secondary`".

Pinned by `renderer/views/base/settings/components/ShortcutDialogRow.test.ts` › "status ink
contrast", which parses the SFC `<style>`:

- the light recipes, verbatim, and no other custom property;
- the dark block equals the three plain tokens;
- every status class uses its variable, the classless (red) line included;
- contrast ≥ 4.5 against `--tx-bg-color-overlay`, read from the `:root` and `.dark` blocks of
  `packages/tuffex/packages/components/style/variables.scss`;
- each recipe's `var()` fallback equals the light token it stands for.

Not covered here: the `.is-success` / `.is-error` row tints use `rgba(var(--tx-color-*-rgb), …)`
over a space-separated triplet, so they do not render. If someone fixes them, the light inks still
read 5.26 (green) and 4.78 (red) on those tints.

## Known remaining instances

- **Six older shortcut events are still defined on both sides:** `shortcon:get-all`, `shortcon:update`,
  `shortcon:disable-all`, `shortcon:enable-all`, `shortcon:get-feature` and `shortcon:set-feature`,
  in `main/modules/global-shortcon.ts` and in `renderer/modules/channel/main/shortcon.ts`. Move them
  into `shared/events/shortcut-binding.ts` when either file is next touched, and add any new event
  there.
- **The `ShortcutStatus` mirror has drifted.** The copy in `renderer/modules/channel/main/shortcon.ts`
  lacks `'runtime-missing'` in its `reason` union. A new status field lands in both files.
- **The settings Spotlight hint may never appear.** `getSpotlightHint` waits for a macOS
  `register-failed` / `register-error` on an accelerator containing `Command` and `Space`. On
  macOS 27, `register('Command+Space')` succeeded with Spotlight's ⌘Space enabled.

## Verification

```bash
cd apps/core-app
npx vitest run src/main/modules/global-shortcon.test.ts src/main/modules/box-tool/core-box/index.test.ts \
  src/main/modules/tray src/shared/accelerator-label.test.ts src/shared/corebox-shortcut.test.ts \
  src/renderer/src/modules/shortcuts/useCoreBoxShortcut.test.ts \
  src/renderer/src/modules/shortcuts/main-window-command-catalog.test.ts \
  src/renderer/src/modules/channel/main/shortcon.test.ts \
  src/renderer/src/modules/lang/shortcut-labels.test.ts src/renderer/src/modules/lang/shortcut-notices.test.ts \
  src/renderer/src/components/base/input/FlatKeyInput.test.ts \
  src/renderer/src/components/shell/ShellSidebar.test.ts \
  src/renderer/src/components/shell/MainWindowCommandPalette.test.ts \
  src/renderer/src/views/base/begin/internal/Done.test.ts \
  src/renderer/src/views/base/settings/SettingTools.shortcut-status.test.ts \
  src/renderer/src/views/base/settings/components/ShortcutDialogRow.test.ts
npm run typecheck:node
```

The suite is 17 files and 155 tests (2026-09-26, after the stand-in was removed).

`npm run typecheck:web` rebuilds tuffex first. While a Nexus dev server is running, run
`npx vue-tsc --noEmit -p tsconfig.web.json --composite false` directly instead; see
[../frontend/tuffex-docs-sync.md](../frontend/tuffex-docs-sync.md).

Every rule above was mutation-checked on 2026-09-26, after the stand-in was removed, with 57
compile-time reversions (a Vite `transform` plugin in a scratch vitest config; repo files
untouched). Each one was applied once and failed at least one test listed here. They cover:

- a stand-in put back: registered on a refusal or on a lost conflict, or reported as the effective
  key;
- the notice dropped, repeated per pass, budgeted per cause, given to a key the user chose or to
  the conflict's winner, blind to conflicts, never naming the winner, naming it by raw id, allowed
  to throw out of the pass, or marked only after it was shown;
- the copy blaming another app (refused and conflict, each locale), losing `{other}`, naming ⌘E,
  or getting the stand-in notice or the "暂用" settings line back;
- the command window's in-window ⌘E put back in the catalog, the badge or the capture layer, and
  the row printing no key, the old key, or an empty cap;
- the ⌘E scan fed the old tray, catalog and sidebar sources;
- and the reversions carried over from the earlier rounds: migration, publishing, tray, sidebar,
  onboarding, composable, recorder, rename, grouping, status ink and labels.

The stand-in's own reversions were retired with it.
