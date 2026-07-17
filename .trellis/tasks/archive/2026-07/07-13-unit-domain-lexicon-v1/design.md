# Unit Domain Lexicon V1 Design

## Scope

Implement R8-D only: a read-only shared Domain Lexicon registry and migration of the existing unit conversion table. Plugin SDK exposure, plugin-scoped writes, CatalogService, SQLite, other domains, and CI gates remain out of scope.

## Boundaries

- `packages/utils/i18n/lexicon.ts` owns generic catalog-compatible lexicon types, immutable indexing, canonical resolution, alias matching, and search ranking.
- `packages/utils/i18n/unit-lexicon.ts` owns serializable baseline unit entries only: canonical IDs, localized labels/aliases, version, and conversion-neutral metadata.
- `packages/utils/core-box/preview/abilities/unit-conversion-core.ts` owns numeric conversion functions keyed by canonical unit ID. It consumes the baseline registry; it does not duplicate labels or aliases.
- Preview execution may carry an optional `AppLocale`. CoreApp PreviewProvider and QuickOps developer preview project the current host locale into that context. Existing callers remain valid.

## Public Contracts

```ts
type DomainLexiconDomain =
  | 'unit'
  | 'currency'
  | 'timezone'
  | 'capability'
  | 'fileType'
  | 'systemAction'

interface DomainLexiconEntry {
  id: string
  domain: DomainLexiconDomain
  version: string
  labels: LocalizedText
  aliases: LocalizedList
  searchBoost?: Partial<Record<AppLocale, number>>
  deprecated?: boolean
  replacedBy?: string
  metadata?: Record<string, unknown>
}

interface DomainLexiconSearchOptions {
  locale?: AppLocale
  domain?: DomainLexiconDomain
  limit?: number
}

interface ResolvedDomainLexiconEntry {
  entry: DomainLexiconEntry
  label: string
  aliases: string[]
}

class DomainLexiconRegistry {
  constructor(entries: readonly DomainLexiconEntry[])
  resolve(id: string, locale?: AppLocale): ResolvedDomainLexiconEntry | null
  matchAlias(input: string, options?: DomainLexiconSearchOptions): DomainLexiconMatch | null
  search(query: string, options?: DomainLexiconSearchOptions): DomainLexiconMatch[]
  list(domain?: DomainLexiconDomain): readonly DomainLexiconEntry[]
}
```

Unit conversion APIs keep their names and add an optional locale where display is produced. `UnitDefinition` gains `id`; `UnitConversionResult` gains localized `fromLabel` / `toLabel` without removing existing fields.

## Indexing And Ranking

- Validate non-empty IDs/domains and reject duplicate canonical IDs during registry construction.
- Copy/freeze entry data at construction so callers cannot mutate the registry through source objects.
- Build an exact alias index and a folded lowercase index once. Exact symbol matching runs first; this preserves `KB` versus `Kb`.
- Folded aliases support user-friendly case-insensitive textual input. Collisions remain candidate lists, never last-write-wins.
- Alias candidates record provenance (`default` or `AppLocale`). Exact match outranks prefix/substring; current-locale provenance receives a bounded boost; ties use canonical ID for deterministic ordering.
- Parsing is locale-independent: aliases from all locales enter the index. Locale affects ranking and resolved labels only.

## Unit Baseline

- Canonical IDs use `unit.<category>.<stable-key>`; metadata carries `category` and exact `symbol`.
- Every existing unit remains available. Existing conversion factors and temperature formulas are unchanged.
- Lexicon data is JSON-serializable; functions stay in the conversion map.
- Startup construction verifies every unit lexicon entry has a conversion and every conversion points to an entry.
- Default locale in legacy unit APIs remains `zh-CN` to avoid changing existing cards; host paths now pass their actual normalized locale.

## Data Flow

```text
Host locale -> PreviewAbilityContext.locale
User query -> parseUnitQuery -> registry.matchAlias(all locale aliases)
Canonical unit ID -> conversion map -> numeric result
Canonical unit ID + active locale -> registry.resolve -> localized labels
Result -> existing PreviewSDK / CoreApp card contracts
```

## Compatibility And Failure Rules

- Existing imports and function names remain valid.
- Unknown units and cross-category conversions keep explicit failure results.
- Invalid/duplicate baseline entries fail during module initialization rather than silently shadowing another unit.
- No mutable registration API is exposed in this slice.
- No network, database, dynamic execution, or catalog loading is introduced.

## Verification

- Generic registry tests: duplicate ID rejection, immutable copies, canonical resolve, cross-locale alias matching, deterministic search/ranking.
- Unit tests: Chinese/English mixed aliases under both locales, localized labels, all entries mapped, unchanged representative conversions, and exact `KB`/`Kb` distinction.
- Existing PreviewSDK and CoreApp calculation tests stay green.
- Run package typecheck, focused lint, and focused Vitest suites.
