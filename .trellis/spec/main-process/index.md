# Main Process Spec Index

Electron main-process (apps/core-app/src/main) coding contracts.

## Documents

- [pi-provider-contracts.md](pi-provider-contracts.md) — renderer→main→pi
  boundary: @files attachment channel (dual-mirrored types, spill validation
  skip-not-fail, hint contract), stream commit/rollback semantics (pending).
- [agent-tool-gateway-contracts.md](agent-tool-gateway-contracts.md) — how
  model-callable tools reach `pi`: loopback gateway topology, executor arg
  order, confirmation/remember semantics (proxy tools narrow rememberKey via
  `classify`), MCP risk mapping, home skills-injection surface marker,
  degrade-not-abort rules, opt-in live smoke.

- [database-write-contracts.md](database-write-contracts.md) — single-writer-per-file
  topology, `scheduleDbWrite`/`scheduleAuxWrite` call-site convention, scheduler
  busy-retry semantics (never sleep holding the queue), live home resolution,
  search-split parity rules, boot-time maintenance write gating.
- [search-hotpath-contracts.md](search-hotpath-contracts.md) — per-keystroke search
  path: token dedup funnels through `addSearchToken` (O(1) WeakMap/Set), per-app
  derivation memoized with a content key that must cover every input field, cached
  arrays are shared read-only references.
- [search-charset-and-identity-contracts.md](search-charset-and-identity-contracts.md)
  — charset rules import from search-charset only; SEARCH_KEYWORD_SCHEMA_VERSION
  bump semantics (app auto / file via bound backfill, never through the disk-reading
  worker); gated paged migration pattern; usage identity = source.id everywhere.

## Quality Check

Before committing main-process DB changes:

```bash
cd apps/core-app
grep -rn "schedule([^)]*withSqliteRetry" src/main --include="*.ts" | grep -v test   # must be empty
npm run typecheck:node
npx vitest run src/main/db/
```
