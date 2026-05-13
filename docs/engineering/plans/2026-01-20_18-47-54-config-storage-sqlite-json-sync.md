---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: Config storage strategy (SQLite vs JSON) + progress doc for related items
complexity: complex
planning_method: builtin
created_at: 2026-01-20T10:47:54Z
---

# Plan: Config Storage Strategy and Progress Doc

Task Overview
This plan defines a storage strategy for configuration data, favoring SQLite for local-only items while preserving a path for multi-device sync needs. It also produces a single consolidated document covering related items, how to implement them, and current progress.

Execution Plan
1. Inventory config items and current storage paths (JSON files, SQLite tables, in-memory caches) across core app and shared utils.
2. Classify each item by sync requirement, size, sensitivity, and latency needs; define target storage policy per class.
3. Decide the authoritative source for sync-required data (JSON-first vs SQLite-first with sync adapter) and document rationale.
4. Design a storage abstraction interface with adapters for SQLite and JSON, including read/write semantics and versioning.
5. Draft a migration plan with read-fallback, one-time import, and rollback strategy for each candidate item.
6. Update the permission-center PRD and TODO statuses to reflect current completion and storage reality; list remaining Phase 5 gaps.
7. Create a consolidated progress document listing related PRDs, scope, implementation steps, and current status.
8. Validate the plan with a small pilot migration (low-risk config) and define test/verification gates.

Risks and Notes
- Data migration errors or silent data loss if fallback is incomplete.
- Sync conflicts if JSON and SQLite both act as sources of truth.
- Backward compatibility with existing config file formats.
- Performance regressions in high-frequency reads/writes.

References
- docs/plan-prd/TODO.md
- docs/plan-prd/03-features/plugin/permission-center-prd.md
- docs/plan-prd/03-features/search/EVERYTHING-SDK-INTEGRATION-PRD.md
- docs/plan-prd/04-implementation/CoreAppRefactor260111.md
