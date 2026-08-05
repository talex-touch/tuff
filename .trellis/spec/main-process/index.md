# Main Process Spec Index

Electron main-process (apps/core-app/src/main) coding contracts.

## Documents

- [database-write-contracts.md](database-write-contracts.md) — single-writer-per-file
  topology, `scheduleDbWrite`/`scheduleAuxWrite` call-site convention, scheduler
  busy-retry semantics (never sleep holding the queue), live home resolution,
  search-split parity rules, boot-time maintenance write gating.

## Quality Check

Before committing main-process DB changes:

```bash
cd apps/core-app
grep -rn "schedule([^)]*withSqliteRetry" src/main --include="*.ts" | grep -v test   # must be empty
npm run typecheck:node
npx vitest run src/main/db/
```
