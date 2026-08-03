# Technical Design

## Scope Boundary

This task removes three obsolete operating-system-global shortcut registrations. It does not introduce a general shortcut scope abstraction because CoreBox already owns a working page-level keyboard route for both Flow commands.

## Runtime Changes

### AI Quick Call

Delete the `core.box.aiQuickCall` registration and teardown from `CoreBoxModule`. The ordinary `core.box.toggle` registration remains unchanged.

### Flow Detach / Transfer

Delete `FlowBusModule.registerShortcuts()`, the two main-process callbacks, shortcut IDs/owner metadata, and their teardown calls. CoreBox owns both contextual input paths:

1. `useKeyboard` receives `keydown` in the CoreBox host document.
2. `Cmd/Ctrl+D` dispatches `corebox:detach-item`.
3. `Cmd/Ctrl+Shift+D` dispatches `corebox:flow-item`.
4. A focused CoreBox plugin `WebContentsView` classifies the same combinations in `before-input-event` and broadcasts the existing typed `FlowEvents.triggerDetach` / `triggerTransfer` notification to the owning CoreBox window.
5. `useDetach` keeps Flow Transfer in renderer state. Detach sends dedicated `CoreBoxEvents.uiMode.detach` without any plugin identity.
6. Main accepts that request only from the owning CoreBox renderer, resolves the attached `TouchPlugin` and `WebContentsView`, enforces `division-box:session:open`, and moves the existing view through `createSessionWithoutUI()` / `attachExistingUIView()`.
7. Before asynchronous session creation, CoreBox relinquishes the exact view's cache entry without closing its `WebContents` and blocks concurrent plugin-view attachment. A successful transfer leaves no CoreBox cache owner.
8. If session creation or partial view attachment fails, DivisionBox reports whether the view was released, never owned, or could not be released. The first two states destroy the session before CoreBox restores the same view, feature identity, and prior cache entry. A failed release never restores shared ownership: it destroys the session, abandons CoreBox input/clipboard monitoring, exits UI mode, and closes any still-live orphan view.

The generic `DivisionBoxEvents.open` permission boundary remains unchanged: a CoreBox renderer cannot claim authoritative plugin identity with a payload `pluginId`. The child-view handler prevents the key only while the controller still owns that exact view and the CoreBox window remains available and visible. An extracted/cached view outside CoreBox therefore receives its normal key input and cannot trigger the old CoreBox context.

## Persisted Data Migration

Add a bulk removal operation to `ShortcutStorage` that:

- accepts a readonly list of shortcut IDs;
- removes matching records;
- persists once only when at least one record changed;
- returns the removed count for diagnostics/tests.

`ShortcutModule.onInit()` invokes it before the first registration pass using an explicit retired-ID list:

- `core.box.aiQuickCall`
- `flow:detach-to-divisionbox`
- `flow:transfer-to-plugin`

Keeping the retirement list at the storage owner boundary guarantees stale records disappear even though the feature modules no longer depend on ShortcutModule.

## Compatibility

- Existing user customizations for the three retired IDs are intentionally removed because no configurable global action remains.
- All unrelated shortcut records and callbacks remain untouched.
- Existing CoreBox page shortcuts continue using their current fixed combinations.
- No IPC/preload exposure is added.

## Risks And Controls

- Risk: removing main-process Flow callbacks changes which detach implementation wins while CoreBox is focused. Control: both host and plugin-view contexts converge on `CoreBoxEvents.uiMode.detach`; main validates the owning CoreBox sender, resolves the main-owned view/plugin objects, and preserves generic DivisionBox authorization.
- Risk: the renderer could forge a plugin ID to open a privileged view. Control: the dedicated detach payload carries no plugin identity, and existing `DivisionBoxEvents.open` fail-closed rules remain unchanged.
- Risk: an extracted plugin view still owns its old listener. Control: check `this.uiView === view` before preventing or dispatching so transferred views fall through.
- Risk: CoreBox's view cache can outlive a successful transfer and later reattach or close the DivisionBox-owned view. Control: relinquish only the exact cached view without closing it before session creation, restore the cache entry only after a failed transfer is back in CoreBox, and lock CoreBox attachment while ownership is in flight.
- Risk: `attachExistingUIView()` can fail after DivisionBox records or mounts the view. Control: use an explicit `released` / `not-owned` / `failed` ownership result. Restore only after a confirmed release or pre-ownership failure; otherwise destroy the session, abandon CoreBox monitoring state, exit UI mode, and close the view if still alive.
- Risk: stale settings remain visible. Control: bulk migration runs before registration and has direct unit coverage.
- Risk: shared event removal causes cross-package type failures. Control: repository-wide reference search plus CoreApp node/web typechecks.
- Rollback: restore the deleted registrations/events and remove the retired-ID migration entries; unrelated persisted settings are never changed.
