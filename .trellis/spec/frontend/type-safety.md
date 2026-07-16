# Type Safety

> TypeScript and runtime safety patterns in this project.

---

## Overview

Frontend code is TypeScript-first. Keep type ownership close to the contract:

- Component-only props/emits can live beside the component.
- Reusable component contracts live in TuffEx component-local `types.ts`.
- Cross-layer SDK, transport, plugin, permission, i18n, and domain payload types live in `packages/utils` or the existing owning package.
- Intelligence mirror types live in `packages/tuff-intelligence` when the SDK is mirrored there.

---

## Type Organization

Use type-only imports for types:

```ts
import type { FileUploaderEmits, FileUploaderProps } from "./types";
```

Use local interfaces for component-local props:

```ts
interface Props {
  title?: string;
  disabled?: boolean;
}
```

Use shared package types for cross-layer data. Examples:

- `packages/utils/types/intelligence.ts`
- `packages/utils/transport/events/assistant.ts`
- `packages/utils/transport/sdk/domains/intelligence.ts`
- `packages/utils/i18n/localized.ts`

---

## Typed Transport And SDKs

Do not add raw event names or untyped payload casts where a typed event/domain SDK exists.

The event builder in `packages/utils/transport/event/builder.ts` is the current type-safe pattern:

```ts
const queryEvent = defineEvent("core-box")
  .module("search")
  .event("query")
  .define<{ text: string }, SearchResult[]>();
```

When adding a new event kind, SDK method, JSONL record, or RPC payload:

1. Define the shared type in the owning package.
2. Add the typed event/domain SDK mapping.
3. Normalize runtime input at the boundary.
4. Update focused tests in both producer and consumer packages when the payload crosses packages.

---

## Runtime Validation

This codebase uses explicit guards and normalizers more often than a single global validation library.

Examples:

- `packages/utils/i18n/localized.ts` uses `isLocalizedText`, `isLocalizedList`, `resolveLocalizedText`, and `resolveLocalizedList`.
- Nexus engagement tracking normalizes action payloads before sending.
- Plugin permission boundaries return explicit reason strings such as `permission-denied`, `permission-sdk-unavailable`, and `clipboard-write-failed`.

Prefer this pattern for untrusted or cross-layer inputs:

```ts
function normalizeSource(value: unknown): DocEngagementSource {
  return value === "doc_comments_admin" ? "doc_comments_admin" : "docs_page";
}
```

## Scenario: Async Search Gather Update Ownership

### 1. Scope / Trigger

- Trigger: changing search gather callbacks, provider result emission, cancellation,
  or `search.update` / `search.end` publication in CoreApp.
- This contract prevents an async merge/rank callback from finishing after the
  terminal event has already been published.

### 2. Signatures

```ts
export type TuffAggregatorCallback = (
  update: TuffUpdate,
) => void | Promise<void>;

export interface IGatherController {
  abort: () => void;
  promise: Promise<number>;
  signal: AbortSignal;
}
```

### 3. Contracts

- Every fast, late-fast, deferred, empty, final, and cancellation update uses one
  ordered dispatcher and observes the callback Promise.
- Provider searches remain concurrent, but a provider worker that produced a
  result waits for its update to settle before taking another provider.
- The first `isDone: true` update wins. It waits for the callback already running,
  invalidates queued non-terminal callbacks, and prevents later emissions.
- `IGatherController.promise` settles only after the winning terminal callback.
- `cancelSearch()` requests abort but does not publish `search.end` directly. The
  ordered cancellation callback is the only cancellation-completion owner.
- Callback rejection preserves the original error, aborts remaining provider
  work internally, and must not be rewritten as a provider error or cancellation.

### 4. Validation & Error Matrix

- Async callback resolves -> deliver the next valid update in FIFO order.
- External abort during a callback -> finish that callback, skip queued results,
  deliver one `cancelled: true` terminal, then resolve the controller with `0`.
- Normal terminal selected before abort -> keep the normal terminal and its count.
- Callback rejects -> reject the controller with the same error and emit no
  cancellation terminal.
- Provider fails or times out -> record provider status and continue; do not treat
  it as a callback failure.

### 5. Good / Base / Bad Cases

- Good: async merge/rank settles before `search.end`, including cancellation.
- Base: synchronous callbacks continue to work without an adapter.
- Bad: fire-and-forget `onUpdate(update)` followed by immediate controller resolve.
- Bad: both `cancelSearch()` and the gather cancellation callback send
  `search.end`.

### 6. Tests Required

- Delayed callbacks assert completion order through the final update.
- Terminal callback tests assert the controller remains pending until settlement.
- Cancellation tests assert queued updates are skipped and one cancelled end is
  sent after any running update settles.
- Callback rejection tests assert original-error identity and provider abort.
- A provider barrier asserts configured provider concurrency is preserved.

### 7. Wrong vs Correct

#### Wrong

```ts
onUpdate(update);
resolve(totalCount);
```

#### Correct

```ts
const outcome = await dispatcher.emit(update);
if (update.isDone && outcome === "delivered") {
  resolve(totalCount);
}
```

## CoreBox Icon Payload Contracts

Recommendation and search-result icons cross main-process providers, rebuilders, and Vue renderers. Normalize icon inputs at the producer boundary instead of making renderer components infer filesystem semantics.

### 1. Scope / Trigger

- Trigger: app/plugin recommendation items that carry icon payloads into CoreBox renderers.
- Producer examples: app scanner/search processing, plugin recommendation rebuilding.
- Consumer examples: `TxIcon`-backed CoreBox list and grid item renderers.

### 2. Signatures

Icon payloads use the existing Tuff icon shape:

```ts
type CoreBoxIconPayload = {
  type: "class" | "url" | "file" | "emoji" | "svg";
  value: string;
  color?: string;
  colorful?: boolean;
  status?: string;
  error?: string;
};
```

Recommendation badges use class icon names, not emoji text:

```ts
type RecommendationBadge = {
  label: string;
  icon: `i-${string}`;
};
```

### 3. Contracts

- `data:` image URLs remain URL icons and must set `colorful: true`.
- `file://` local file URLs are decoded with shared file-path helpers, checked as filesystem paths, then emitted as `tfile://` URL icons with `colorful: true`.
- Existing `tfile://` values are preserved as URL icons with `colorful: true`.
- Existing local filesystem paths are checked, converted to `tfile://`, and marked `colorful: true`.
- Empty, missing, or nonexistent app icon inputs fall back to `{ type: 'class', value: 'i-ri-apps-line' }`.
- Plugin recommendation rebuilding must preserve supported icon metadata fields: `type`, `value`, `color`, `colorful`, `status`, and `error`.
- Renderer badge components should only render class badge icons that start with `i-`; stale cached emoji badge values are ignored.
- macOS app icon caches must resolve Electron paths through a bound `app.getPath(...)` call; detached Electron methods fail with `Illegal invocation` and must not silently route production data into test-temp fallbacks.
- macOS app bundles use `app.getFileIcon(path, { size: 'normal' })` as the primary icon source and persist versioned, display-sized PNG caches; `.icns`/`sips` remains fallback-only.
- `/System/Library/CoreServices` entries marked `LSBackgroundOnly` or `LSUIElement` are not user-facing applications and must be excluded before indexing; recommendation rebuilding also applies the shared CoreServices noise filter to stale rows.
- Addressable `TxIcon` sources show a loading skeleton until `load`; an `error` event must switch to the caller-provided empty fallback instead of leaving a blank image.

### 4. Validation & Error Matrix

- Empty icon input -> app fallback class icon.
- Missing local path -> app fallback class icon.
- Invalid or malformed local file URL -> app fallback class icon.
- Valid `data:` / `file://` / `tfile://` / local path -> URL icon with source colors preserved.
- Plugin icon with unsupported `type` or empty `value` -> recommendation fallback class icon.
- Badge icon not starting with `i-` -> omit the visual badge icon and keep the label.
- Electron cache path lookup throws or is called without its `app` receiver -> use the stable temporary fallback only in non-Electron/test contexts; production callers keep the Electron cache directory.
- Native macOS icon extraction returns an empty image or throws -> try the bundle `.icns` fallback, then emit the normal app fallback icon.
- URL/tfile image load error -> render the `empty` slot or empty-image source and clear the loading skeleton.
- CoreServices background/UIElement bundle -> omit it from scan and recommendation results.

### 5. Good/Base/Bad Cases

- Good: `file:///Applications/Foo.app/.../icon.icns` becomes a checked `tfile://...` URL icon with `colorful: true`.
- Base: no icon value becomes `i-ri-apps-line`.
- Bad: passing `file://...` directly to `fs.existsSync()` or rendering badge emojis as text.

### 6. Tests Required

- App icon normalization tests for `data:`, `file://`, `tfile://`, local path, empty input, and missing path.
- Drift handling tests comparing local paths with equivalent `file://` values.
- Plugin recommendation rebuild tests that assert optional icon metadata is preserved.
- Renderer tests that assert list and grid badges use class icons and image icons keep color forwarding.
- macOS extraction tests assert bound cache-path resolution, `app.getFileIcon(..., { size: 'normal' })`, versioned cache reuse, and `.icns` fallback behavior.
- TuffEx icon tests dispatch image `error` and assert that loading state is removed and the empty fallback is rendered.
- Recommendation/filter checks cover hidden CoreServices apps so stale indexed rows cannot return to the recommendation surface.

### 7. Wrong vs Correct

#### Wrong

```ts
if (existsSync(rawIconValue)) {
  return { type: "file", value: rawIconValue };
}
return { type: "file", value: "" };
```

#### Correct

```ts
const localPath = resolveLocalFilePath(rawIconValue);

if (localPath && existsSync(localPath)) {
  return { type: "url", value: toTfileUrl(localPath), colorful: true };
}

return { type: "class", value: "i-ri-apps-line" };
```

## Scenario: Plugin Widget Metadata Serialization

### 1. Scope / Trigger

- Trigger: one plugin item exposes the same context, memory, citation, or action summary through `render.custom.data`, `meta.payload`, and `meta.intelligence`.
- The host transport uses `structuredStrictStringify()` with one identity map for the whole item. Reusing one object reference in two branches is encoded as `[Circular ~path]`, even when the graph is only aliased and not cyclic.

### 2. Signatures

```ts
export function structuredStrictStringify(value: unknown): string;

type ContextSummaryPlacement = {
  render: { custom: { data: { contextPackage: Record<string, unknown> } } };
  meta: {
    payload?: { contextPackage?: Record<string, unknown> };
    intelligence: { contextPackageId?: string; contextSessionId?: string };
  };
};
```

### 3. Contracts

- `render.custom.data.contextPackage` is the widget-facing metadata-only summary and must survive strict serialization as an object.
- Action payloads that must carry the summary use a deep JSON-compatible clone; they must not reuse the render payload object or any nested arrays/records.
- `meta.intelligence` stores flattened trace/package/session fields, not another full summary object.
- Full prompt, turn, memory, retrieval chunk, API key, or token content remains forbidden in every branch.

### 4. Validation & Error Matrix

- JSON-compatible summary -> clone per branch and serialize normally.
- Missing/non-object summary -> emit `null` or omit the field.
- Unsupported or cyclic summary -> reject or drop the summary; never expose a `[Circular ...]` string as valid widget state.
- Render summary becomes a string after transport -> treat as a serialization contract failure, not as a renderer formatting issue.

### 5. Good / Base / Bad Cases

- Good: render and action payloads contain equal but reference-distinct summaries; strict serialization preserves both objects.
- Base: no context summary produces `contextPackage: null` and flattened IDs are absent.
- Bad: `render.custom.data.contextPackage === meta.payload.contextPackage` before transport.
- Bad: copying the top-level object while sharing nested `sourceTypes`, `candidate`, or `tags` references.

### 6. Tests Required

- Build the complete plugin item, run `structuredStrictStringify()`, parse it, and assert both render/action summaries remain objects.
- Assert `meta.intelligence` contains package/session/trace IDs but no full `contextPackage`.
- Cover degraded summaries so `degradedReason` remains visible after transport.
- For packaged evidence, inspect the mounted widget payload and verify `contextPackage` is an object before claiming the UI boundary/degraded state works.

### 7. Wrong vs Correct

#### Wrong

```ts
const contextPackage = summarizeContextPackage(result);
item.render.custom.data.contextPackage = contextPackage;
item.meta.payload.contextPackage = contextPackage;
item.meta.intelligence.contextPackage = contextPackage;
```

#### Correct

```ts
item.render.custom.data.contextPackage = cloneMetadataRecord(contextPackage);
item.meta.payload.contextPackage = cloneMetadataRecord(contextPackage);
item.meta.intelligence.contextPackageId = contextPackage.id;
item.meta.intelligence.contextSessionId = contextPackage.sessionId;
```

## Scenario: Plugin Widget Host Action Dispatch

### 1. Scope / Trigger

- Trigger: an interactive custom plugin widget emits a host action that must cross `WidgetFrame` -> CoreBox renderer -> main search provider -> plugin lifecycle.
- The same click must mutate widget state without also executing the containing feature item or creating a second provider request.

### 2. Signatures

```ts
type WidgetHostAction = {
  actionId: string;
  payload?: Record<string, unknown>;
};

type CoreBoxExecuteRequest = {
  item: TuffItem;
  searchResult?: TuffSearchResult;
  actionId?: string;
};

type PluginItemActionContext = {
  actionId?: string;
};
```

### 3. Contracts

- The renderer clones the item, merges `WidgetHostAction.payload` into `item.meta.payload`, writes `item.meta.actionId`, and also sends top-level `actionId`.
- The main plugin adapter routes an action when top-level `actionId`, metadata `actionId`, or `defaultAction` is present. When top-level and metadata IDs differ, top-level `actionId` wins in the item passed to the plugin.
- An idle widget may omit `defaultAction` so selecting the feature still enters `onFeatureTriggered`; an explicit host action for the matching `featureId` must remain valid without that field.
- Custom widget DOM clicks stop at the custom-render boundary. The host action event is forwarded, but the enclosing result `trigger` event is not emitted.
- `activationFeature` is an immutable execution snapshot. Live pushed widget state updates `feature` only and must not mutate the snapshot later used for Send.

### 4. Validation & Error Matrix

- Empty `actionId` -> ignore in the renderer; do not dispatch.
- Explicit top-level `actionId` with stale metadata ID -> normalize the dispatched item to the explicit ID.
- Matching widget `featureId` plus recognized explicit action -> call `onItemAction` once.
- Missing plugin name or missing lifecycle handler -> return `null` and log the existing adapter error/warning path.
- Host action followed by a bubbled feature trigger -> contract failure because it can reset state or duplicate provider work.

### 5. Good / Base / Bad Cases

- Good: selecting `stateless` emits one `select-context-mode` action, updates the pressed state, and performs no feature retrigger.
- Base: selecting the feature item without an action ID enters the feature execution path.
- Bad: requiring `defaultAction` for every widget control; idle widgets intentionally omit it.
- Bad: storing the live pushed widget object as `activationFeature`; input clearing then mutates the execution payload.

### 6. Tests Required

- Component test: clicking a custom widget control emits `host-action` and does not emit `trigger`.
- Adapter test: metadata-only `actionId` routes to `onItemAction`; explicit top-level IDs override stale metadata.
- Plugin test: context/model widget actions work when `defaultAction` is absent but `featureId` and explicit `actionId` are present.
- CoreBox hook test: pushed render state updates `feature` while `activationFeature` retains interaction and accepted-input metadata.
- Packaged evidence: one Send click produces one visible answer and exactly one provider request.

### 7. Wrong vs Correct

#### Wrong

```vue
<div class="CoreBoxRender" @click="emitTrigger">
  <WidgetFrame @host-action="forwardAction" />
</div>
```

```ts
if (item.meta?.defaultAction) {
  await plugin.onItemAction(item, context);
}
```

#### Correct

```vue
<div class="CoreBoxRender" @click="emitTrigger">
  <div class="CoreBoxRender-Custom" @click.stop>
    <WidgetFrame @host-action="forwardAction" />
  </div>
</div>
```

```ts
if (
  args.actionId ||
  typeof item.meta?.actionId === "string" ||
  item.meta?.defaultAction
) {
  await plugin.onItemAction(normalizeActionItem(item, args.actionId), {
    actionId: args.actionId,
  });
}
```

---

## Common Patterns

- Use `unknown` at untrusted boundaries, then narrow with type guards or normalizers.
- Use `Partial<Record<AppLocale, string>>` style maps for localized values.
- Use discriminated unions for event/payload kinds.
- Use readonly or cloned outputs for data that leaves a store/helper.
- Keep payload field names stable once they appear in SDKs, manifests, evidence, or stored data.

---

## Forbidden Patterns

- Do not add `any` for convenience. If a boundary is unknown, use `unknown` and normalize.
- Do not cast raw payload fields repeatedly in UI code.
- Do not define cross-layer types inside a page component.
- Do not bypass typed transport with raw IPC/channel strings.
- Do not silently swallow schema/payload mismatches. Return explicit degraded or blocked reasons.
- Do not store provider secrets, tokens, prompts, responses, or sensitive paths in ordinary typed UI objects that can later be logged or synced.

---

## Common Mistakes

- Treating bundled internal manifests as untrusted external data without checking the actual source.
- Treating user config, plugin manifests, browser APIs, or network responses as trusted because they already have TypeScript types.
- Changing a shared payload shape without updating both SDK tests and renderer/domain consumer tests.
- Letting evidence JSON or migration reports claim a stronger source than they actually represent.

## Scenario: Archived Context Continuation

### 1. Scope / Trigger

- Trigger: `IntelligenceContextExecutionRequest.context.mode === 'continue'` targets an archived, expired, idle, or missing session.
- The contract prevents duplicate primary-key inserts and prevents an old raw conversation from crossing a fresh session boundary.

### 2. Signatures

```ts
type ContextContinuationReason =
  | "archived-session-continuation"
  | "expired-session-continuation"
  | "idle-session-continuation"
  | "continuation-session-missing";

interface ContextContinuationSummary {
  sourceSessionId?: string;
  reason: ContextContinuationReason;
  status: "included" | "excluded" | "unavailable";
  summarySourceType?: "compression_snapshot" | "session_summary";
  summarySourceId?: string;
  degradedReason?: string;
}
```

`PrepareContextTurnResult.continuation` and `IntelligenceContextExecutionSummary.continuation` use the same canonical type from `packages/utils/types/intelligence.ts`; `packages/tuff-intelligence` re-exports it.

### 3. Contracts

- A fresh active requested session continues in place. Archived/expired/idle/missing continuation always creates a generated session id; never insert the requested id again.
- Validate owner and `contextActorId` before resolving any source summary.
- Prefer the latest policy-valid CompressionSnapshot; use legacy `session.summary` only when no snapshot exists and secret policy permits it.
- Carry at most one `summary` item. Never copy source raw turns, MemoryItem rows, prompt/response, paths, or summary text into the public continuation metadata.
- Persist only `continuedFromSessionId` and `continuationReason` in checkpoint/session metadata. Widget projections whitelist the typed summary fields.

### 4. Validation & Error Matrix

- Active + inside idle window -> reuse session; no continuation boundary metadata.
- Archived/expired/idle + safe summary -> fresh session, `session_start`, `status='included'`.
- Snapshot or legacy summary blocked -> current input continues, `status='excluded'`, metadata-only degraded reason.
- Source or summary missing/read failure -> current input continues, `status='unavailable'`.
- Owner/actor mismatch -> `CONTEXT_SESSION_SCOPE_MISMATCH`; no session/checkpoint write.
- Token budget or no-history policy rejects the carryover -> exclude the summary; never fall back to raw history.

### 5. Good / Base / Bad Cases

- Good: archived session snapshot becomes one system summary in a new session and the widget shows an understandable transition reason.
- Base: a normal active continuation remains on the same session.
- Bad: calling `createSession()` with the archived requested id and failing on a duplicate primary key.
- Bad: a blocked snapshot falls back to old turns or exposes summary text in `execution.context`.

### 6. Tests Required

- SQL/session test: new id differs from source; checkpoint metadata contains only source id/reason.
- Package test: safe snapshot wins over legacy summary and source raw turns are absent.
- Policy tests: blocked and missing summaries keep current input with excluded/unavailable metadata.
- Invoke/stream test: provider receives the safe summary while the returned context remains metadata-only.
- Plugin/widget test: strict serialization preserves sanitized continuation/checkpoint fields and omits raw package items.

### 7. Wrong vs Correct

#### Wrong

```ts
const requested = await getSession(input.sessionId);
if (requested.status !== "active") {
  return createSession(input); // reuses the archived primary key
}
```

#### Correct

```ts
const fresh = await createSession({
  ...input,
  sessionId: undefined,
  metadata: { continuedFromSessionId: requested.id, continuationReason },
});
// Resolve one governed summary; raw source turns stay behind the boundary.
```

## Scenario: Metadata-Only Tombstone Explain

### 1. Scope / Trigger

- Trigger: host memory revalidation removes a package item with `reason='memory-tombstoned'`, and Intelligence Audit renders package-log explain metadata.
- This contract makes deletion visible without exposing the deleted memory or source conversation.

### 2. Signatures

```ts
interface ContextPackageLogSafeSummary {
  excludedCount: number;
  policyBlockedCount: number;
  prunedCount: number;
  tombstoneCount: number;
}

function getContextExplainReasonI18nKey(
  reason: string,
): "intelligence.audit.contextReasonMemoryTombstoned" | undefined;
```

### 3. Contracts

- `memory-tombstoned` increments `excludedCount` and `tombstoneCount`; it is not a token prune or generic policy-block count.
- Excluded items contain only normalized `sourceType`, `sourceId`, `reason`, and optional `tokenEstimate`. Drop accidental `content`, prompt, turn, memory, path, or secret fields.
- Known reasons map through stable message-catalog keys. Unknown reasons remain visible as their safe machine string and must not be mislabeled.
- Both inline audit summary and explain drawer show the localized tombstone count/reason.

### 4. Validation & Error Matrix

- `memory-tombstoned` -> tombstone count + localized deletion-before-invoke reason.
- `token-budget-pruned` -> prune count only.
- `*-policy-blocked` -> policy block count only.
- Unknown reason -> no i18n key; render normalized reason text.
- Malformed excluded record -> normalize/drop unsafe fields; never display content.

### 5. Good / Base / Bad Cases

- Good: user sees that one deleted memory source was removed after preparation, with source id and no content.
- Base: package without exclusions reports zero tombstones and renders no notice.
- Bad: displaying raw `memory-tombstoned` as the only UI explanation.
- Bad: forwarding an excluded record's accidental `content` field to the drawer.

### 6. Tests Required

- Summarizer test asserts independent tombstone/excluded counts and exact safe item shape.
- Mapper test asserts the tombstone key and unknown-reason fallback.
- CoreApp web typecheck covers template and i18n integration.
- Packaged/real-profile claims require separate Electron evidence; focused tests do not upgrade those levels.

### 7. Wrong vs Correct

#### Wrong

```ts
return metadata.excluded; // may include deleted memory content
```

#### Correct

```ts
return metadata.excluded.map(
  ({ sourceType, sourceId, reason, tokenEstimate }) => ({
    sourceType: normalizeSourceType(sourceType),
    sourceId: normalizeId(sourceId),
    reason: normalizeReason(reason),
    tokenEstimate: normalizeTokenEstimate(tokenEstimate),
  }),
);
```

## Scenario: Clone-Safe Workflow Editor Payloads

### 1. Scope / Trigger

- Trigger: a Vue composable builds a `WorkflowDefinition` from reactive editor state and sends it through the typed Intelligence SDK to Electron main.
- Also applies when a new workflow or built-in template clone is persisted to `intelligence_workflow_steps`.

### 2. Signatures

```ts
function buildWorkflowDefinition(): WorkflowDefinition;

interface WorkflowModelInputSource {
  type: string;
  stepId?: string;
}
```

### 3. Contracts

- Type safety does not imply Electron structured-clone safety. No Vue proxy may escape in an SDK/transport payload; project reactive arrays such as `toolSources` into plain arrays.
- New and built-in-derived workflows receive a fresh workflow id. Their step ids must be regenerated in that workflow's scope because `intelligence_workflow_steps.id` is globally keyed.
- When step ids are regenerated, every model `previousStep.stepId` reference must be remapped in the same projection. Existing saved non-builtin workflows preserve their stable ids.
- Provider unavailable, quota, or model errors are domain results after dispatch; they must not be conflated with renderer transport or persistence failures.
- Workflow context session lifecycle is per run: the first `text.chat` model step uses `new / session`; later chat steps use `continue / session` with the same id. A different run must never reuse that id.

### 4. Validation & Error Matrix

- Reactive `toolSources` reused directly -> Electron rejects with `An object could not be cloned`.
- Plain copied `toolSources` -> request reaches main with values preserved.
- Built-in step id reused -> workflow-step primary-key insert fails.
- Scoped step ids + remapped predecessor reference -> clone persists and the run reaches workflow execution.
- No enabled provider -> terminal explicit provider-unavailable result; persistence remains successful.
- First Workflow chat step sent as `continue` to a missing id -> degraded continuation and no stable within-run session. First `new`, later `continue` -> no missing-continuation metadata and stable multi-step history.

### 5. Good / Base / Bad Cases

- Good: a fresh packaged built-in workflow persists, creates run/history, and returns an explicit domain status.
- Base: saving an existing user workflow preserves its current step ids.
- Bad: passing `draft.toolSources` directly because the TypeScript type matches.
- Bad: regenerating step ids without updating `previousStep` references.

### 6. Tests Required

- Outbound workflow from a reactive draft passes `structuredClone()` and preserves selected tool sources.
- Built-in clone test derives expected step ids from the emitted workflow id and checks predecessor-reference remapping.
- CoreApp renderer typecheck and focused lint pass.
- Packaged fresh-profile smoke proves transport + persistence + terminal domain status; it does not imply provider success or owner/scope context evidence.
- Multi-step Workflow orchestration test covers `[new, continue, new, continue]`, same-session reuse inside each run, and distinct sessions across runs.

### 7. Wrong vs Correct

#### Wrong

```ts
return {
  toolSources: draft.toolSources,
  steps: draft.steps.map((step) => ({ id: step.id })),
};
```

#### Correct

```ts
const inputSources = parsedInputSources.map((source) => {
  if (source.type !== "previousStep" || !source.stepId) return source;
  const remappedStepId = stepIdMap.get(source.stepId);
  return remappedStepId ? { ...source, stepId: remappedStepId } : source;
});

return {
  toolSources: [...draft.toolSources],
  steps: [{ id: resolvedStepIds[index], inputSources }],
};
```

## Scenario: CoreBox Shortcut Visibility Ordering

### 1. Scope / Trigger

- Trigger: changing CoreBox shortcut handling, `WindowManager.show()`, renderer visibility hooks, or the typed CoreBox show/shortcut events.
- The renderer may enter its show lifecycle from native window visibility before it receives the canonical `show: true` transport event.

### 2. Signatures

```ts
WindowManager.show(triggeredByShortcut?: boolean): void
CoreBoxEvents.ui.shortcutTriggered
CoreBoxRetainedEvents.legacy.shortcutTriggered
CoreBoxEvents.ui.trigger // { id: number; show: boolean }
```

### 3. Contracts

- For `show(true)`, publish both shortcut-origin notifications before calling `BrowserWindow.show()` / `showInactive()` and before broadcasting `CoreBoxEvents.ui.trigger { show: true }`.
- All three events target the same CoreBox `webContents`; their dispatch order is part of the AutoPaste contract.
- Renderer shortcut intent is single-use: `onShow()` may consume it once and then resets it.
- `show(false)` does not emit shortcut-origin notifications and must not enable implicit AutoPaste.
- Clipboard freshness, capture-source eligibility, TTL, and duplicate-suppression guards remain authoritative after the ordering fix.

### 4. Validation & Error Matrix

- Shortcut notification before native show -> fresh eligible clipboard text auto-fills once.
- Native/canonical show before shortcut notification -> `onShow()` observes false and skips AutoPaste.
- Programmatic show -> no shortcut flag and no implicit AutoPaste.
- Stale, ineligible, or already-consumed clipboard item -> no AutoPaste even for a shortcut show.

### 5. Good / Base / Bad Cases

- Good: hidden CoreBox receives shortcut intent, becomes visible, then auto-fills a fresh native-watcher item.
- Base: tray/programmatic show keeps the existing query and clipboard behavior.
- Bad: moving `shortcutTriggered` emission below `BrowserWindow.show()` or below the canonical show broadcast.

### 6. Tests Required

- Focused CoreBox main and renderer visibility tests remain green.
- A live isolated Electron smoke hides CoreBox, writes a unique short clipboard value, opens through the global shortcut, and asserts the textbox value exactly once.
- AutoClear smoke covers both sides of its hidden-time boundary so shortcut ordering does not regress session cleanup.

### 7. Wrong vs Correct

#### Wrong

```ts
window.show();
transport.broadcastToWindow(window.id, CoreBoxEvents.ui.trigger, {
  id,
  show: true,
});
transport.sendTo(
  window.webContents,
  CoreBoxEvents.ui.shortcutTriggered,
  undefined,
);
```

#### Correct

```ts
transport.sendTo(
  window.webContents,
  CoreBoxEvents.ui.shortcutTriggered,
  undefined,
);
window.show();
transport.broadcastToWindow(window.id, CoreBoxEvents.ui.trigger, {
  id,
  show: true,
});
```
