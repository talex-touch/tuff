# Transport Legacy Cutover Evidence — Design

## 1. Family cutover order

1. CoreBox renderer/main/plugin SDK aliases.
2. Auth + Account request/state aliases.
3. Sync lifecycle aliases.
4. Terminal request + data/exit aliases.
5. Opener plugin/install/drop/app aliases.

Each family is migrated and verified before its definitions are removed. The final integration pass removes aggregate exports and the telemetry helper.

## 2. Runtime shape after cutover

```text
producer -> canonical TuffEvent -> exactly one canonical handler/consumer

removed alias string -> tombstone registry -> source audit/evidence only
```

No runtime alias registry exists. A tombstone is inert data and must not be imported by runtime modules outside evidence tooling.

## 3. Tombstone model

```ts
interface RemovedLegacyAlias {
  family: 'core-box' | 'auth' | 'account' | 'sync' | 'terminal' | 'opener'
  legacyEvent: string
  canonicalEvent: string
  direction: 'renderer-to-main' | 'main-to-renderer' | 'main-to-plugin'
  sourceModule: string
  removedIn: string
}
```

The registry contains exactly 71 entries. Duplicate `legacyEvent`, duplicate `(family, legacyEvent)`, empty canonical names, or canonical names equal to the legacy name are invalid.

## 4. Evidence model

`legacy-alias-evidence/v1`:

```ts
interface LegacyAliasEvidence {
  schema: 'legacy-alias-evidence/v1'
  generatedAt: string
  repositoryVersion: string
  decision: { type: 'explicit-hard-cut'; source: 'user-objective' }
  runtimeObservation: { status: 'not-collected' } | {
    status: 'collected'
    windowStart: string
    windowEnd: string
    hitCount: number
    source: string
  }
  aliases: Array<{
    tombstone: RemovedLegacyAlias
    productionHits: SourceAnchor[]
    testFixtureHits: SourceAnchor[]
  }>
  gate: { passed: boolean; failures: string[]; warnings: string[] }
}
```

The current artifact uses `not-collected`; that is a warning, not a fabricated zero. The explicit user hard-cut decision permits cutover only after the static/canonical gates pass.

## 5. Source classification

Production scan roots: `apps/*/src`, `packages/*` runtime sources, `plugins/*/src`. Exclude generated output, node_modules, tests, fixtures, docs, task/evidence directories, the tombstone registry, and the evidence tool itself.

Tests/fixtures are scanned separately for transparency and do not block the gate. A production occurrence of a legacy string blocks, regardless of whether it appears in send/on/export code or an undocumented string constant.

## 6. Strict gate

Fail when:

- registry count is not 71;
- any tombstone field is missing or duplicated;
- any production alias occurrence remains;
- decision is not `explicit-hard-cut`;
- runtime observation claims collected zero without valid window/source;
- evidence contains payload-like keys (`payload`, `data`, `userInput`, `token`, `deviceId`, absolute path fields);
- evidence aliases do not exactly cover the registry.

`runtimeObservation.status = not-collected` is retained verbatim and surfaced as a warning.

## 7. Verification and rollback

Focused tests prove canonical behavior. The evidence verifier proves codebase cutover and artifact integrity. A rollback must restore a complete family slice; the tombstone remains available to make the reintroduced production occurrences visible.
