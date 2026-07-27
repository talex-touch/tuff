# SearchSDK Technical Design

## Boundary

SearchSDK is a generic, in-process plugin utility in `packages/utils/plugin/sdk/`. It reuses shared matching primitives from `packages/utils/search/` and is exported from the canonical plugin SDK index. It does not call transport, request permissions, read databases, or depend on `TuffItem` and CoreApp private sort policy.

## Proposed Contract

```ts
interface SearchField<T> {
  key: string
  values: (candidate: T) => string | readonly string[] | null | undefined
  weight?: number
}

interface SearchHit<T> {
  id: string
  candidate: T
  score: number
  matches: Array<{
    field: string
    value: string
    type: 'exact' | 'prefix' | 'contains' | 'subsequence' | 'fuzzy'
    ranges: Array<{ start: number, end: number }>
  }>
}

interface SearchSession<T> {
  add(candidates: readonly T[]): SearchSnapshot<T>
  snapshot(): SearchSnapshot<T>
}

createSearchSession<T>({
  query,
  getId,
  fields,
  limit,
  signal,
  tieBreak,
}): SearchSession<T>
```

Names may be adjusted to existing SDK conventions during implementation, but behavior is fixed by the PRD and tests.

## Matching And Ranking

- Normalize query once per session; preserve original candidate text for ranges.
- For each configured field value, classify exact, prefix, contains, subsequence, then typo-tolerant fuzzy by reusing `fuzzyMatch`.
- Field weights multiply a bounded base score. The best field match owns primary score; additional distinct field matches may add a small bounded bonus.
- Stable order: score descending, optional domain tie-break, then first-seen ordinal, then id.
- Maintain only `limit` best hits plus a seen-id set, keeping memory bounded across incremental pages.
- Repeated ids update neither ordinal nor result unless the API explicitly receives a replace mode; MVP ignores duplicates deterministically.

## Incremental Semantics

- `add(page)` updates one session and returns a snapshot with `processed`, `matched`, and sorted hits.
- Adding the same candidates in pages or one array must yield identical Top-K output.
- AbortSignal is checked before and during batch processing; an aborted session cannot accept later pages.
- Query changes are represented by a new session, not mutable session reset.

## Compatibility

- Existing `fuzzyMatch`, `matchFeature`, and `ISearchManager` remain compatible.
- SearchSDK is an additive export. It must not silently change CoreBox ranking.
- Clipboard types remain outside the SDK package contract.

## Risks

- Dynamic-programming fuzzy matching can become expensive for long candidate values. Bound normalized value length and skip fuzzy fallback for pathological lengths while retaining exact/contains checks.
- Highlight ranges must remain aligned with original Unicode strings; tests cover CJK, emoji/surrogate pairs, and case-insensitive Latin input.
- Top-K optimization must be proven equivalent to a full deterministic sort.

## Rollback

The SDK is additive. Rollback removes the new export and consumer adoption without changing existing search engine behavior or stored data.
