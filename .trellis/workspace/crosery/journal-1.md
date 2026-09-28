# Journal - crosery (Part 1)

> AI development session journal
> Started: 2026-09-28

## Session 1 — macOS watcher startup CPU fix

- Branch: `task/fix/macos-watcher-startup-cpu`
- Scope: replace deep macOS Chokidar registration traversal with lazy FSEvents delivery and bounded scoped reconciliation.
- Validation: focused core tests 85/85, utility tests 18 passed/1 skipped, benchmark tests 8 passed/1 skipped, node typecheck passed, changed lint passed, `build:vite` passed, `quality:pr` passed, branch policy passed.
- Evidence: 20k-file registration CPU median 467.613ms → 3.991ms; instrumented registration filesystem calls 20,451 → 0; all 18 synthetic add/change/unlink events delivered.
- Limitation: full candidate Electron packaging was blocked by the local Electron download/runtime path, so the upstream PR must remain draft/partial and must not claim full-app energy reduction.

---
