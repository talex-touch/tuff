# Transport Typed Event Hard Cut — Design

## 1. sendSync removal

Delete the method/property at every public and generated boundary:

- `ITouchClientChannel` and `TouchChannel` in plugin channel runtime;
- renderer `TouchChannel` hook interface;
- shared transport channel types;
- generated plugin Prelude class;
- CoreApp removed-capability string union;
- test fixtures that still construct a fake `sendSync` member.

No replacement is needed: typed `send` is async and already owns timeout/error behavior. Preload smoke keeps an assertion that page context does not expose the property.

## 2. CoreBox event ownership

`CoreBoxEvents` is the sole canonical value owner. Definitions use builder names even when the previous raw channel was shorter.

| Area | Builder namespace/module/action |
|---|---|
| Search | `core-box/search/{query,session,cancel,update,index-committed,end,no-results,indexing-diagnostics}` |
| Input | `core-box/input/{focus,get,set,clear,set-query,set-visibility,change,request-value}` |
| Item | `core-box/item/{execute,clear,toggle-pin}` |
| Clipboard | `core-box/clipboard/{allow,change}` |
| UI/Layout/Provider/etc. | preserve existing canonical builder names |

Changing the event object updates every typed producer/consumer without raw string edits. Tests that assert names are updated to canonical builder names.

## 3. Type ownership

Move retained-file payload interfaces into `events/types/core-box.ts` and export them through the existing types index. Both canonical events and temporary legacy alias definitions import those types. Runtime code does not depend on the legacy module for types or values.

## 4. Temporary legacy boundary

During this child task, `core-box-retained.ts` becomes a legacy-only module containing raw aliases. The next child owns telemetry evidence, source-hit inventory, dual-listener closure, and deletion. No new caller may import it for canonical events.

## 5. Validation

- Source audit distinguishes callable `sendSync` from tests that assert absence.
- Event boundary tests reject new raw canonical CoreBox definitions.
- Existing producer/consumer tests exercise the new builder names through event objects.
