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
recommendationSourceRegistry.registerSource({ sourceId, aliases?, rebuild }): () => void
recommendationSourceRegistry.canonicalize(sourceId): string
recommendationSourceRegistry.resolve(sourceId): RecommendationSourceEntry | undefined
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
- **Missing records are omitted, not reported.** An uninstalled app or deleted file should vanish
  from the grid; that is the correct outcome, not an error path.
- **One failing source must not empty the grid.** `rebuildSourceItems` catches per source and
  returns `[]`; an unregistered `sourceId` logs a warn and is skipped.
- **`ItemRebuilder` holds no db handle and no source name in its dispatch path.** Its constructor
  takes no arguments. Adding a source is a registration, never an edit to that file.

### 4. Validation & error matrix

| Condition | Outcome |
|---|---|
| Provider without the capability passed to `registerProviderSource` | returns `null`; not an error (most providers never recommend) |
| Duplicate `sourceId` | throws; the incumbent keeps answering |
| Alias claimed by another source, or colliding with a registered id | throws; registry unchanged (no partial alias claim) |
| Source throws during rebuild | error logged, that group yields `[]`, other groups unaffected |
| `sourceId` with no registration | warn logged, group skipped, rest of the batch returned |
| Registry or rebuilder imports a provider | `import-direction.test.ts` fails |
| Engine reconstructed | it unregisters its own standalone ids first, then re-registers; nothing else writes those ids |

### 5. Tests required

`recommendation-source-registry.test.ts` (alias resolution, conflict throw, no-partial-claim,
dispose/re-claim, provider binding via `this`), `item-rebuilder.test.ts` `dispatch` group (routing,
batching, unknown source, throwing source, plugin-recommend candidates excluded from source
dispatch), each source's own suite for its db behaviour, and `import-direction.test.ts`.

The app source's two filters — `isSelfAppIdentity` and `matchNoisySystemAppRule` — need
discriminating fixtures. Nothing in the type system protects them, and the failure mode
(recommending Touch itself or CoreServices helpers) only shows up in a running app.

### 6. Known remaining work

- `findScoredByPartialMatch()` still branches on `plugin-features` / `app-provider` /
  `application`. That is identity matching, not rebuild dispatch, and was out of scope. Folding it
  into a source-declared capability would also fix the next item.
- Clipboard recommendation items are dropped by `mergeAndEnrichItems`: the source emits
  `clipboard-<id>` while the stored candidate id is the bare number, and there is no clipboard
  branch in `findScoredByPartialMatch`. Unreachable today because nothing writes
  `sourceId: 'clipboard-history'` usage stats.
- Built-in `main-window-provider` duplicates `plugins/touch-system-actions`' `open-main-window`;
  its `MAIN_WINDOW_PHRASE_TOKENS` literally contains that action's name. The built-in
  `system-actions-provider` is *not* a duplicate of that plugin — it covers file/index/screenshot
  actions, not power control.
