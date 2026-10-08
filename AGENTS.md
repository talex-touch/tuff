# Project Engineering Instructions

Work directly from the user's confirmed scope and the repository's engineering guides. Do not initialize a project task lifecycle or require a workflow CLI.

## Workflow and Knowledge

- Read `docs/engineering/specs/frontend/index.md` or `docs/engineering/specs/main-process/index.md` before editing the corresponding layer, and follow the applicable checklists.
- Shared engineering guides live under `docs/engineering/specs/guides/`; product plans remain under `docs/plan-prd/`.
- `docs/comet/` preserves pre-exit requirements, specifications, verification evidence, and delivery records. Keep those records read-only; they do not define the current execution workflow or prove that a new change has passed acceptance.
- Read `docs/engineering/workflow/backlog.md` and the relevant handoff before resuming frozen work. Confirm its current scope and acceptance criteria without changing the historical task record.
- Check the current branch/worktree before writing and verify changed behavior in its actual runtime. Git commit, merge, push, PR creation, and release require explicit user authorization.
- Preserve concurrent changes, engineering records, and user configuration. Do not copy local runtime/logs into formal artifacts.

Project Skill roots are `.omp/skills/`, `.claude/skills/`, and `.agents/skills/`; Codex-specific hooks and rules remain under `.codex/`.

## Shared-machine discipline

Several agents work in this checkout at once on the user's own workstation, next to the user's interactive `pnpm core:dev` instance. On 2026-10-07 that instance lagged 1–2s every few seconds for 28 minutes while agents ran `tsc`, `vitest` and extra Electron instances in parallel (load average 16 on 14 cores).

- Run heavy jobs (`tsc`, `vitest`, builds, isolated Electron instances) with `nice -n 10`; the dev wrapper honours `TUFF_DEV_NICE=10` for isolated instances started through `scripts/dev-electron-wrapper.mjs`.
- Before starting any Electron instance or crash harness, check that the user's dev instance is not running (an `Electron Helper` process whose `--user-data-dir` is the default `@talex-touch/core-app` profile, or a listener on the vite port 5173). If it is, do not start yours.
- One isolated Electron instance per agent at a time; close it as soon as the evidence is captured.

## Standing Audits / Known Issues

Before touching **search / file-indexing / cross-platform** code, read the living audit backlog — it tracks confirmed defects and prioritized risks with `file:line` references so you don't re-discover or re-introduce them:

- **Search & cross-platform audit** → [`docs/engineering/reports/search-crossplatform-audit.md`](docs/engineering/reports/search-crossplatform-audit.md)
  - **B1**: the main-process embedding writer is wired; real embedding Provider write/recall acceptance remains open. The 2026-09-18 zero-row measurement is a pre-fix baseline, not the current write-path status. **B2** completion weighting is fixed (`01546fdea`).
  - **R1**: native screenshot/audio build contracts and audio release packaging were connected; screenshot packaged-runtime acceptance remains open. **R2** architecture policy and cross-platform release evidence remain unresolved. **R3** large-directory scan/reconcile memory peaks remain tracked.
  - 🟡/🟢 Arch debt & cleanup: R4–R9, C1–C6.
  - Resume B1 from its current audit evidence: prove configured Provider writes and semantic recall; do not reimplement the existing writer based on the old zero-row baseline.

Keep this list current: when a finding is fixed or invalidated, check it off in the living audit with a reason.
