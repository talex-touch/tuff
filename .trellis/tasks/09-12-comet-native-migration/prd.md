# Migrate repository workflow from Trellis to Comet Native

## Goal

Retire the repository-managed Trellis workflow in a controlled follow-up and adopt Comet Native as the default workflow without losing project engineering knowledge, CI contract coverage, or safe multi-session recovery.

## Confirmed facts

- Comet `@rpamis/comet` 0.4.0 provides Native and Classic workflows. Native uses Shape → Build → Verify → Archive, stores readable artifacts under `<artifact_root>/comet/`, and keeps runtime state under `.comet/runtime/native/`.
- Comet's `oh-my-pi` target writes Skills under `.omp/skills/`, MDC rules under `.omp/rules/`, and the Hook Router under `.omp/hooks/pre/comet-hook-router.ts`. These paths were independently read by omp v18.1.16 in a temporary probe.
- The repository contains 2348 tracked `.trellis` files (about 44 MB), including 114 tracked active task metadata entries and 203 archived task metadata entries. Active status is 71 `in_progress` and 45 `planning`.
- `.github/workflows/ci.yml` indirectly protects the Trellis layout through Documentation Quality and PR Quality. `scripts/check-audit-report-claims.mjs` fails when `.trellis/tasks` is empty; `apps/core-app/src/main/roadmap-task-links.test.ts` resolves active ROADMAP links into `.trellis/tasks`.
- `.trellis/spec/` contains 37 engineering documents. `docs/engineering/` currently has only `reports/` and `notes/`, so any proposed `specs/` destination is new and would enter normal documentation lint scope.

## Requirements

1. Freeze a final Trellis snapshot before any removal or rewrite.
2. Install only the approved Comet platform targets, never `comet init --yes`, and verify the generated Skill, Rule, Hook, config, and ignore behavior before committing them.
3. Pilot one real Comet Native change and verify interruption recovery, worktree binding, independent verification, archive confirmation, and multi-change Spec conflict handling.
4. Preserve reusable `.trellis/spec/` knowledge under a deliberate `docs/engineering/specs/` structure, with documentation verification passing after relocation.
5. Replace every CI and product-test dependency on Trellis task paths before deleting `.trellis/`.
6. Keep the serialized `PluginAiSessionsPlatform` value `trellis` unchanged unless a separate compatibility change explicitly approves and verifies its replacement.
7. Keep the migration itself separate from unrelated voice work, generated build output, and existing stashes.

## Acceptance criteria

- A final Trellis snapshot is identifiable and rollback can restore the pre-cutover tree.
- `/comet` enters Native in omp, generated Hook Router calls are enforced, and `comet doctor` and `comet status --json` report healthy state.
- A real pilot change resumes after interruption and leaves complete readable state and verification artifacts.
- The relocated engineering Specs and all rewritten fixtures pass Documentation Quality.
- PR Quality, App suites (core-app), Typecheck, Integration, and all other required checks pass on the cutover PR.
- No active or archived Trellis task is silently claimed by a Comet change; unresolved tasks are explicitly frozen, converted, or abandoned.
- The final repository contains no live Trellis workflow entry points, stale CI task-source assumptions, or broken documentation links.

## Out of scope

- Bulk conversion of all Trellis PRD, design, implement, JSONL, evidence, journal, or binary artifact history into Comet changes.
- Renaming the shipped `PluginAiSessionsPlatform` `trellis` value without a separate compatibility plan.
- Installing Comet into Claude, Codex, Cursor, Pi, OpenCode, or other platforms without an explicit platform decision.
- Deleting the current untracked build output, voice artifacts, or existing stashes.
