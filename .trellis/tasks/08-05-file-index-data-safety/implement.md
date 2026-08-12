# Implement plan: file index data safety

Ordered checklist; keep the tree green at each step. Do not widen scope.

1. [ ] Read and anchor-check: file-scan-utils.ts scan loop + result shape;
       file-provider.ts reconcile block (~:2872) and cleanup paths (~:1181-1215);
       reconciliation-run/delete services; search-result-service groupRows/stale
       (~:255, :488); watch-service path ingress; indexing-write-plan.ts:493; the
       gated maintenance pattern used at boot (find via integrity service /
       storage-maintenance). Record drift in check.jsonl.
2. [ ] D5 mtime quantization + utils test (cheapest, lands protection for D4's
       reconcile churn measurements).
3. [ ] D1 scan error counting (utils) + D2 per-root deletion guard (core-app) +
       tests (zero-scan guard, error-threshold guard).
4. [ ] D3 search-path deletion fix + stat-verified cleanup + tests
       (filter-excluded survives; ENOENT-only removal).
5. [ ] D4 normalizeFsPath helper + ingress call sites + gated migration + tests
       (NFD in / NFC lookup; twin merge keeps newer; old-id index cleanup through
       existing removal APIs). Respect database-write-contracts.md lanes.
6. [ ] Gates: `cd apps/core-app && npx vitest run src/main/modules/box-tool/addon/files/`;
       `cd packages/utils && npx vitest run`; `cd apps/core-app && npm run typecheck:node`.
       Record outputs in check.jsonl. NO git commit (main session commits).

Rollback: revert the task commit; the D4 migration is idempotent (normalize twice is
a no-op) and gated, so a revert simply stops future runs.
