# CoreBox AI Dispatch Idempotency Design

## Data Flow

```text
manifest feature activation (canonical interaction contract)
  -> pushed widget render/action updates
  -> merge visual state while preserving interaction/extension metadata
  -> widget host action
  -> null action response means no activation transition
  -> send-mode input watcher suppresses regular search
  -> explicit send executes one feature request
```

## Ownership

- `useSearch` owns the renderer activation descriptor and preserves the manifest feature contract while swapping in current widget render/action data.
- `CoreBox.vue` owns application of host-action activation responses. Absence of a response is not a deactivation signal.
- The plugin owns draft/request state and latest-response commit; it does not mirror CoreBox provider activation.

## Activation Merge

When `refreshActiveWidgetFeature()` receives a pushed widget item, it merges it over the previous activation feature:

- next item wins for `id`, `render`, action/status metadata and current payload;
- previous feature supplies missing `interaction`, `meta.interaction`, `meta.extension`, and manifest identity fields;
- the result is a new object; neither source object is mutated.

This keeps `hasSendModePluginFeatureActivation()` true after widget updates without freezing the visual payload.

## Host Action Semantics

`CoreBoxEvents.item.execute` may return:

- a non-empty activation state: normalize and apply it;
- `null`/`undefined`: action completed without an activation transition, so preserve the current activation;
- explicit exit/deactivate remains owned by existing provider-exit paths, not inferred from an empty action result.

## Request Semantics

With send mode preserved, the existing `watch(searchVal)` branch cancels pending debounced search and does not call `core-box:query` for non-empty edits. Enter/send remains the only submit path. Existing plugin `activeRequestId/uiRequestId` guards continue to prevent stale response commits.

## Compatibility And Rollback

- Non-widget and non-send-mode activation merge behavior is unchanged.
- Webcontent input monitoring remains on its dedicated forwarding path.
- Rollback is limited to the activation merge helper and null-response guard; no schema or persisted state changes are involved.
