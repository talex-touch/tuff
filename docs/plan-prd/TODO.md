# Tuff 当前执行顺序

> Authority: this document is the sole global execution-order source. Live task status, assignee, acceptance criteria, blocker, and evidence are authoritative only in the active [Trellis task tree](../../.trellis/tasks/README.md).

## Current order

1. **Close verified release and runtime blockers.** Complete the active OTA, macOS release-evidence, and application-icon acceptance work according to their task-local PRDs. The OTA parent remains concurrently owned; this document does not restate its volatile child status.
2. **Complete the active search and cross-platform remediation.** The audit parent owns the backlog; active children own Windows productionization and the default-off [search-index split write-path migration](../../.trellis/tasks/07-28-migrate-search-index-split-write-paths/prd.md). The split flag must remain off until its child task has direct flag-on app-run evidence for every writer.
3. **Continue remaining independently-owned active tasks** in the order recorded here only after the preceding blocker lane is resolved; task-local PRDs define implementation order and acceptance.

## Non-negotiable safety gates

- `DB_SEARCH_SPLIT_ENABLED` / `TUFF_DB_SEARCH_SPLIT_ENABLED` defaults **off**. Enabling it before all named 2d/2e writes migrate causes provider writes to land in `database.db` while reads use `search-index.db`: **silent data loss**.
- A flag-on app run, not typecheck alone, must prove first-launch reindex, matching app/file counts, correct results, populated `search-index.db`, healthy indexing, and flag-off rollback before the split can be enabled.
- Historical reports prove only their recorded environment. Packaged and production claims require exact observed artifacts or deployed surfaces; they are never inferred from source state.

## Task-state rules

- Use `python3 ./.trellis/scripts/task.py list` for live task state. Do not copy active counts, branch names, HEADs, dirty-worktree state, or implementation snapshots into this document.
- A completed task moves to the archive only with completed status or fully checked acceptance criteria plus concrete evidence; children move before parents.
- Roadmaps, task PRDs, change records, and topical TODOs may describe local scope or immutable history but must not define another global priority order.

## Local and historical references

- Search/cross-platform audit: [task PRD](../../.trellis/tasks/07-13-search-crossplatform-audit/prd.md)
- AI: [TODO-AI.md](./TODO-AI.md)
- R3: [TODO-R3.md](./TODO-R3.md)
- Nexus: [TODO-nexus.md](./TODO-nexus.md)
- Long-term debt: [docs/TODO-BACKLOG-LONG-TERM.md](./TODO-BACKLOG-LONG-TERM.md)
- Historical completion facts: [01-project/CHANGES.md](./01-project/CHANGES.md)
- 2026-08-02 maintenance audit: [actionable report](../engineering/reports/maintenance-audit-2026-08-02.md).

## Topical guardrails

- **R2 AI Stable** remains `historical 13/13 / current recapture open`. Any current-version claim must use `--requireCurrentVersion` and a manifest baseline matching `apps/core-app/package.json`; historical artifacts do not become current proof.
- **R9.2 ContextHygiene** retains completed P0/P1 and isolated packaged-entrypoint evidence, while real-profile and later scope migration remain open.
- **R8-F CatalogService MVP**, AI/Assistant/OmniPanel polish, desktop fireworks, and broad search-class refactors remain paused unless their execution lane is reached or a higher-priority stability defect requires direct work.
