<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Standing Audits / Known Issues

Before touching **search / file-indexing / cross-platform** code, read the living audit backlog — it tracks confirmed defects and prioritized risks with `file:line` references so you don't re-discover or re-introduce them:

- **Search & cross-platform audit** → [`.trellis/tasks/07-13-search-crossplatform-audit/prd.md`](.trellis/tasks/07-13-search-crossplatform-audit/prd.md)
  - 🔴 Confirmed defect: **B1** semantic search still a production no-op — the read path landed, but nothing ever writes the `embeddings` table (verified 2026-09-18: 0 embedding rows across 155,716 indexed files, no row ever reaching `completed`). **B2** completion weighting is fixed (`01546fdea`).
  - 🟠 High risk: R1 Rust screenshot module not wired into the build; R2 macOS unsigned/arm64-only vs electron-updater; R3 large-dir scan/reconcile memory peaks.
  - 🟡/🟢 Arch debt & cleanup: R4–R9, C1–C6.
  - Active fix: `.trellis/tasks/07-13-fix-ranking-dead-features/` — B2 done; B1 needs a main-process embeddings writer (a worker cannot reach the tuffIntelligence SDK).

Keep this list current: when a finding is fixed or invalidated, check it off in the backlog `prd.md` with a reason.
