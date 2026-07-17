# Implementation Plan: Nexus sync batch ingest consistency

1. Add bounded JSON chunking, D1 batch-result parsing, and bulk preload helpers in `apps/nexus/server/utils/syncStoreV1.ts`.
2. Replace `pushSyncItemsV1()` per-item D1 calls with validation, preloaded conflict planning, and one atomic write batch.
3. Move quota/session mutation into that transaction and remove the push route's post-write quota delta.
4. Exercise the implementation against local D1 SQL before modifying permanent tests.
5. Add focused regression coverage for >1,000 items, duplicate operations, conflict/tombstone parity, authoritative quota counters, and forced rollback.
6. Run focused Vitest, scoped Nexus ESLint, Nexus type-check, and a local Miniflare smoke.
7. Update P0 backlog and task acceptance evidence only after the behavior is verified.
8. Request explicit confirmation before any isolated preview-D1 verification; never write production D1.
