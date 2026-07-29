# Converge project documentation and gates

## Goal

Restore a truthful, navigable documentation system and make documentation drift fail closed through four independently reviewable implementation PRs.

## Background

- `docs/plan-prd/TODO.md` is intended to be the only global execution-order source, while root `todo.md` still contains an unowned search-index migration plan with a default-off and silent-data-loss warning.
- Roadmap, evidence, release, README, and peripheral product documents contain stale or contradictory claims that must be corrected without turning historical evidence into current, packaged, or production evidence.
- The current CI Markdown job only selects changed root-level `*.md` paths and does not provide the recursive, repository-aware documentation contract required by this plan.
- `.trellis/tasks/07-27-bilingual-whats-changed/` and `.trellis/tasks/07-17-unify-ota-update-flow/task.json` are concurrently owned. They must never be edited, staged, reverted, or absorbed by this task tree.

## Requirements

### R1 - Planning-only parent

- This parent owns requirements, child mapping, dependency order, cross-child acceptance, and final integration review.
- The planning PR may create only this parent and the four child Trellis directories.
- Product documentation, scripts, workflows, release notes, and existing task metadata are out of scope for the planning PR.

### R2 - Child ownership

- `07-27-docs-sot-convergence` owns the global TODO, root `todo.md` migration, truthful completed-task archiving, and retained active-task metadata.
- `07-27-roadmap-release-docs` owns roadmap/evidence/CHANGES and both root READMEs, but not What's Changed or stable release-note files owned by the concurrent bilingual task.
- `07-27-peripheral-docs-cleanup` owns tracked product-document links and named CoreApp/Search/Nexus/DivisionBox/TuffEx surfaces, but not either root README.
- `07-27-documentation-quality-gates` owns the deterministic local/CI gate and starts only after the first three children and the concurrent bilingual contract are available.

### R3 - Evidence semantics

Every corrected claim must keep these states distinct:

1. historical evidence proves only the recorded historical version and environment;
2. current source state is resolved from authoritative repository metadata at execution time;
3. packaged evidence requires an actual packaged artifact for the exact version and platform;
4. production evidence requires an observed deployed or published surface.

No lower evidence class may be promoted to a higher class by wording alone.

### R4 - Delivery topology

- The planning artifacts land first on `TalexDreamSoul/docs-remediation-plan` through a PR to `master`.
- Batches A, B, and C use dedicated Orca worktrees and branches and remain independently reviewable. If they start before the planning PR merges, they may stack on the planning branch and must be retargeted to `master` after it merges.
- Batch D is a draft stacked integration PR until A, B, C, and the bilingual What's Changed prerequisite are present; it must name every prerequisite PR.
- No PR created by this task tree is merged as part of execution.

### R5 - Trellis artifacts

- Parent and children each contain converged `prd.md`, `design.md`, and `implement.md` files.
- Every `implement.jsonl` and `check.jsonl` contains real, existing spec or research entries and no seed-only row.
- Parent/child metadata is bidirectionally consistent, all tasks remain `planning`, and each task has an assignee plus non-empty `meta.nextAction`, `meta.blocker`, and `meta.evidence`.

## Acceptance Criteria

### Planning PR

- [ ] Only the five new Trellis task directories are changed.
- [ ] The parent lists exactly four children and each child points back to this parent.
- [ ] All ten JSONL manifests pass `task.py validate` with at least one real entry each.
- [ ] No product documentation or concurrent-owned file is changed.
- [ ] The planning branch is pushed and a PR targeting `master` is open.

### Program completion

- [ ] Four dedicated implementation PRs exist with explicit ownership, focused validation, dependency notes, and no cross-batch file overlap.
- [ ] `TODO.md` and active Trellis metadata agree on current ownership and priority without losing the search-index safety warning.
- [ ] Roadmap, release, README, and AI claims distinguish historical, current, packaged, and production evidence.
- [ ] Tracked product documentation in scope has no broken inline relative links.
- [ ] One deterministic read-only entrypoint enforces recursive Markdown, link, task-state, release-note, evidence, and placeholder contracts locally and in CI.
- [ ] The concurrent bilingual task and OTA parent `task.json` remain untouched by this task tree.

## Out of Scope

- Implementing any documentation correction in the planning PR.
- Merging planning or implementation PRs.
- Creating release artifacts, publishing releases, or upgrading evidence without observed proof.
- Editing archived historical evidence except where an active document links to it or labels its evidence class incorrectly.
