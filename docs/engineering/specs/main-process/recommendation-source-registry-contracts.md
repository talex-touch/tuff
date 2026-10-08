# Recommendation Source Registry Contracts

## Scenario: adding or changing a CoreBox recommendation source

### 1. Scope / Trigger

Anything that puts items into the empty-state recommendation grid: a new provider that should
appear there, a new standalone source, an alias change, or a change to
`item-rebuilder.rebuildItems`. Introduced by 09-04-reco-source-registry.

### 2. Signatures

```ts
// packages/utils/core-box/tuff/tuff-dsl.ts
interface RecommendationRebuildCapable {
  readonly recommendationSourceAliases?: readonly string[]
  rebuildRecommendationItems(itemIds: readonly string[]): Promise<TuffItem[]>
}

// search-engine/recommendation/recommendation-source-registry.ts
recommendationSourceRegistry.registerProviderSource(provider): (() => void) | null
recommendationSourceRegistry.registerSource({ sourceId, aliases?, rebuild, execute? }): () => void
recommendationSourceRegistry.unregister(sourceId): boolean
recommendationSourceRegistry.canonicalize(sourceId): string
recommendationSourceRegistry.resolve(sourceId): RecommendationSourceEntry | undefined

interface RecommendationSourceEntry {
  readonly sourceId: string
  readonly aliases: readonly string[]
  rebuild(itemIds: readonly string[]): Promise<TuffItem[]>
  execute?(args: IExecuteArgs): Promise<IExecuteOutcome>
}

// search-engine/recommendation/plugin-recommendation-source.ts
createSnapshotRecommendationSource(sourceId, snapshots, execute): {
  sourceId: string
  rebuild(itemIds: readonly string[]): Promise<TuffItem[]>
  execute(args: IExecuteArgs): Promise<IExecuteOutcome>
}
pluginRecommendationSourceId(providerId): string   // `plugin-recommend:<providerId>`
```

### 3. Contracts

- **Two registration paths, chosen by which database answers.** A source that rebuilds from its
  own state implements the capability and is picked up automatically by
  `search-core.registerProvider`. A source that must read through the recommendation engine's
  handles (`dbUtils` for FILE rows, `appCatalogDbUtils` for the app catalog — the #295 search
  split) is created by `RecommendationEngine` and registered standalone. Currently app, file and
  clipboard take path B; `FileProvider` has its own `createDbUtils`, so moving the file rebuild
  onto it silently changes which database is read.
- **Registration is always pushed in by the source.** Neither the registry nor `item-rebuilder`
  may import a concrete provider. Five of the six former `await import()` calls in
  `item-rebuilder` resolve back through `<provider> → search-core → recommendation-engine →
item-rebuilder`; a reverse import turns that dynamic cycle into a static one, and the symptom is
  a boot-time `Cannot access '...' before initialization`, not a type error.
  `import-direction.test.ts` guards this — `core-box/core-box-import-cycle.test.ts` covers a
  different directory and will not catch it.
- **The rebuild hook is batched, not per item.** The app source splits ids into path and bundle-id
  queries and bulk-loads `file_extensions`; a `rebuildItem(id)` shape reintroduces an N+1 that no
  test would notice.
- **Aliases are declared by the source, never by the rebuilder.** They exist because one logical
  source wears several registration ids: the per-platform native file providers
  (`everything-provider`, `macos-spotlight-provider`, `linux-native-file-provider`) plus
  `file-provider`, and the two app spellings (`application`, `app`) that `item_usage_stats` still
  carries.
- **Alias and id conflicts throw at registration.** Last-writer-wins would make recommendation
  contents depend on module evaluation order and would be invisible at runtime. A conflicting
  registration must leave the registry byte-identical — claim all aliases before storing anything.
- **Ordering belongs to the caller.** A source may return items in any order; `mergeAndEnrichItems`
  restores recommendation-score order. Do not sort inside a source.
- **A source with no search provider declares its own `execute`.** `ProviderRegistry.get` misses for
  plugin recommend candidates (`sourceId` is `plugin-recommend:<providerId>`) and for the builtin
  clipboard-URL card (`__builtin_clipboard_url__`); `search-core.execute` falls through to
  `recommendationSourceRegistry.resolve(item.source.id).execute(args)` instead of dropping the run.
  The execution path is generic: a plugin provider's `onExecute`, and the builtin card's URL open,
  both arrive this way. `execute` returns `IExecuteOutcome` (`accepted` + optional `activation`),
  never writes statistics itself, and `accepted === true` is what makes the caller record one
  execution under the same `eventId` as any other entry. A provider without `onExecute` is refused
  at `registerPluginProvider` (it throws) — there is no inert recommendation.
- **The snapshot is host-owned; the renderer payload is not trusted.** `createSnapshotRecommendationSource`
  rebuilds only the ids still present in the live snapshot map and executes only those. `rebuild` for
  an id the provider no longer holds omits it, so a stale card cannot come back clickable.
- **A source must stamp the identity its candidates and usage rows are keyed under.** Whenever the
  rendered `id` differs from the statistical key, the rebuilt item carries
  `meta._originalItemId` / `meta._originalSourceId` so `mergeAndEnrichItems` can match it back to its
  scored candidate and `usage-identity.resolveUsageIdentity` can key the count. Clipboard is the
  concrete case: the card renders as `clipboard-<record.id>` (prefix avoids cross-source collision)
  while the candidate and the usage row are the bare numeric id, so the source stamps
  `_originalItemId: String(record.id)`. Without it every clipboard card resolved to no candidate and
  was silently dropped from the grid; recording was the other half and now also lands under
  `clipboard-history:<bare id>`.
- **Missing records are omitted, not reported.** An uninstalled app or deleted file should vanish
  from the grid; that is the correct outcome, not an error path.
- **One failing source must not empty the grid.** `rebuildSourceItems` catches per source and
  returns `[]`; an unregistered `sourceId` logs a warn and is skipped.
- **`ItemRebuilder` holds no db handle and no source name in its dispatch path.** Its constructor
  takes no arguments. Adding a source is a registration, never an edit to that file.

### 4. Validation & error matrix

| Condition                                                          | Outcome                                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Provider without the capability passed to `registerProviderSource` | returns `null`; not an error (most providers never recommend)                                 |
| Duplicate `sourceId`                                               | throws; the incumbent keeps answering                                                         |
| Alias claimed by another source, or colliding with a registered id | throws; registry unchanged (no partial alias claim)                                           |
| Source throws during rebuild                                       | error logged, that group yields `[]`, other groups unaffected                                 |
| `sourceId` with no registration                                    | warn logged, group skipped, rest of the batch returned                                        |
| Registry or rebuilder imports a provider                           | `import-direction.test.ts` fails                                                              |
| Engine reconstructed                                               | it unregisters its own standalone ids first, then re-registers; nothing else writes those ids |

### 5. Tests required

`recommendation-source-registry.test.ts` (alias resolution, conflict throw, no-partial-claim,
dispose/re-claim, provider binding via `this`), `item-rebuilder.test.ts` `dispatch` group (routing,
batching, unknown source, throwing source, plugin candidate rebuilt through its registered source
rather than an inline branch, a candidate the provider no longer holds dropped), each source's own
suite for its db behaviour, and `import-direction.test.ts`.

The app source's two filters — `isSelfAppIdentity` and `matchNoisySystemAppRule` — need
discriminating fixtures. Nothing in the type system protects them, and the failure mode
(recommending Touch itself or CoreServices helpers) only shows up in a running app.

### 6. Known remaining work

- `findScoredByPartialMatch()` still branches on `plugin-features` / `app-provider` /
  `application`. That is identity matching, not rebuild dispatch, and was out of scope. Folding it
  into a source-declared capability would remove the last per-source branch from that file.
- Isolated-host recommendation registration uses `recommend.provider.register` / `recommend.provider.unregister` through `plugin.recommend` (also the child `recommend` facade). The default runtime capability definitions install this pair; the host resolves tenant ownership, never a plugin-supplied source name.
- `onInit` runs while its host is `starting`. Capability authority reads `PluginRuntimeService.resolveHostGeneration`, which returns only the current, non-stopping activation's starting/active owner generation. `PluginRuntimeHostManager.resolve` stays **active-only**: registration authority must not grant pre-activation execution.
- Registration retains the three declared callbacks under an owned disposer resource. If resource allocation fails after engine registration, immediately call the engine disposer and rethrow; otherwise a rejected registration leaks an executable provider. Release/unload revokes its source, snapshots and callbacks; old or foreign owners cannot unregister a new tenant's provider.
- `canProvide` accepts a boolean or `Promise<boolean>`. Await it inside the same existing 200ms provider budget as candidate retrieval, and isolate rejection/timeout per provider. Promise truthiness is not permission to call `getCandidates`.

### 7. Resolved destination boundary

- 2026-09-12: `app-destination-provider` replaced the built-in `main-window-provider` and owns the sole CoreBox result for main-window/home/Tuff settings destinations. `plugins/touch-system-actions` no longer publishes `open-main-window`; the host capability ID remains for already-installed plugin compatibility and delegates to the shared navigation service. The built-in `system-actions-provider` remains distinct because it covers file/index/screenshot actions, not power control.

## Scenario: sharing the scoring model with an isolated plugin (2026-09-30)

### 1. Scope / Trigger

Changes to public recommendation weights, the child SDK facade, or recommendation callback ownership.

### 2. Signatures

- `createRecommendationWeightModel(): RecommendationWeightModel` owns the formulas and constants in `packages/utils/core-box/recommendation-weights.ts`.
- `plugin.recommend.weights` and Prelude's `recommend.weights` expose `behaviorScore`, `timeContribution`, `isFrequentEligible`, `pluginPriorityContribution`, and `modelVersion`.
- The current semantic version is `reco-model-2`; it is independent of the package release number.

### 3. Contracts

- Host exports and the isolated child realm instantiate the same self-contained factory. Do not maintain a second handwritten formula in the child builtin.
- Child scoring is synchronous and local. Inputs are caller-owned facts; scoring makes no capability request and exposes no other source's usage history.
- Capture realm intrinsics before plugin code runs; freeze the public model and constants. A plugin's later global mutation must not change the host model or the captured child's arithmetic.
- Behaviour contributes at most 80 points; time contributes at most 20, and requires at least 10 dated executions over 3 local days in 30 days. The host clamps automatic behaviour/time/recency to 100.
- The host's learned source-app/yesterday recall is separate from the shared plugin weight factory:
  it adds one confidence-bounded scene term of at most 25 points. It never exposes another source's
  raw history to a plugin or changes `reco-model-2`'s published formulas. Preset context matches may
  nudge by at most ten behaviour-equivalent points. Grid placement is the unified first-five slice,
  not the shared frequent-eligibility verdict.
- Provider priority contributes at most 5 points and cannot confer frequent eligibility. Eligibility requires 5 dated executions over 3 local days in 30 days.
- Register and release callbacks through the current tenant generation. Starting-host registration is permitted; executing before activation, using a foreign owner, and retaining callbacks after unload are not.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| One execution or fewer than 3 reliable local days | No time contribution |
| Priority far above 100 | Contribution remains at most 5 |
| Exposures without executions | No behaviour credit or frequent eligibility |
| Missing `onExecute` | Registration fails; no inert candidate |
| Callback ownership is stale or foreign | No provider execution or new usage admission |
| Host resource allocation fails after registration | Dispose the source and callbacks before rejecting |

### 5. Good / Base / Bad Cases

- Good: a real isolated provider reports `reco-model-2` and a priority contribution of 5 for priority 1,000,000.
- Base: no reliable history produces no time credit and no automatic habit.
- Bad: port the old unbounded time formula into the child or infer habit evidence from exposure totals.

### 6. Tests Required

- Shared weight boundary tests cover one-use time credit, cross-day gates, saturation, and priority bounds.
- Host/runtime tests cover callback retention, rollback, generation ownership, unload, and isolated realm execution.
- Real Electron verification must register an isolated provider, invoke its scoring facade, execute a real action, and revoke its source on disable. A mock returning the expected object cannot prove this boundary.

### 7. Wrong vs Correct

```ts
// Wrong: a second formula that can drift from the host.
const weights = { behaviorScore: facts => facts.executeCount * 10000 }
// Correct: exports and the child realm instantiate the same factory source.
const weights = createRecommendationWeightModel()
```

