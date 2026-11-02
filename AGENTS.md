# Project Engineering Instructions

Work directly from the user's confirmed scope and the repository's engineering guides. Do not initialize a project task lifecycle or require a workflow CLI.

## Workflow and Knowledge

- Read `docs/engineering/specs/frontend/index.md` or `docs/engineering/specs/main-process/index.md` before editing the corresponding layer, and follow the applicable checklists.
- Shared engineering guides live under `docs/engineering/specs/guides/`; product plans remain under `docs/plan-prd/`.
- `docs/comet/` preserves pre-exit requirements, specifications, verification evidence, and delivery records. Keep those records read-only; they do not define the current execution workflow or prove that a new change has passed acceptance.
- Read `docs/engineering/workflow/backlog.md` and the relevant handoff before resuming frozen work. Confirm its current scope and acceptance criteria without changing the historical task record.
- Check the current branch/worktree before writing and verify changed behavior in its actual runtime. Git commit, merge, push, PR creation, and release require explicit user authorization.
- Preserve concurrent changes, engineering records, and user configuration. Do not copy local runtime/logs into formal artifacts.

## Branch and merge discipline

- Normal feature, fix, docs, and maintenance work MUST start from `origin/master` on a `task/<type>/<slug>` branch. Do not develop or commit directly on `master` or `stage`.
- Push the task branch and open a pull request into `master`; required checks MUST pass before merging. Direct pushes to protected long-lived branches are not the normal landing path.
- After the PR is merged, delete the task branch only when no active work still depends on it. Release version bumps and beta/stable tags continue to follow `docs/engineering/specs/guides/branch-and-release.md`.


Project Skill roots are `.omp/skills/`, `.claude/skills/`, and `.agents/skills/`; Codex-specific hooks and rules remain under `.codex/`.

## Shared-machine discipline

Several agents work in this checkout at once on the user's own workstation, next to the user's interactive `pnpm core:dev` instance. On 2026-10-07 that instance lagged 1–2s every few seconds for 28 minutes while agents ran `tsc`, `vitest` and extra Electron instances in parallel (load average 16 on 14 cores).

- Run heavy jobs (`tsc`, `vitest`, builds, isolated Electron instances) with `nice -n 10`; the dev wrapper honours `TUFF_DEV_NICE=10` for isolated instances started through `scripts/dev-electron-wrapper.mjs`.
- Before starting any Electron instance or crash harness, check that the user's dev instance is not running (an `Electron Helper` process whose `--user-data-dir` is the default `@talex-touch/core-app` profile, or a listener on the vite port 5173). If it is, do not start yours.
- One isolated Electron instance per agent at a time; close it as soon as the evidence is captured.

## Runtime invariants

- **The scheduler decides the executor.** A third-party CLI binary (`codex`, `claude`, `omp`) runs only under its own scheduler profile: `profile:cli:codex`, `profile:cli:claude`, `profile:cli:omp`. Any other scheduler, Tuff included, and a run that names no scheduler, handed a model of that CLI only reuses the endpoint the CLI's own config describes (`providers/cli-config-provider.ts`): `~/.codex/config.toml`, `~/.claude/settings.json`, `~/.omp/agent/models.yml`. The model's provider supplies endpoint configuration; it never selects the executor. The built-in Tuff runtime (`pi`) is not a third-party CLI and is outside this rule.
  - Enforced by the `THIRD_PARTY_CLIS` table and `chatStream` in `providers/pi-cli-provider.ts`; locked by `providers/pi-cli-provider.cli-config.test.ts` and `providers/cli-config-provider.test.ts`. Do not add a setting, provider flag, or fallback that lets a non-matching run spawn a CLI binary.
  - Why: a CLI runs its own agent loop and tools outside Tuff's policy, and `codex exec` streams no token deltas. Under the Tuff scheduler the host must own the turn.
  - Meta: a reused endpoint tags each chunk with its own provider id (`codex-config`, `claude-config`, `omp-config`); the pi host records it at stream end, so message meta names the endpoint that answered, not the routed CLI provider.
  - How to apply: keep `metadata.profileId` as the only switch. Any new call site that can reach `PiCliProvider` must carry the scheduler's profile id.

## Standing Audits / Known Issues

Before touching **search / file-indexing / cross-platform** code, read the living audit backlog — it tracks confirmed defects and prioritized risks with `file:line` references so you don't re-discover or re-introduce them:

- **Search & cross-platform audit** → [`docs/engineering/reports/search-crossplatform-audit.md`](docs/engineering/reports/search-crossplatform-audit.md)
  - **B1**: the main-process embedding writer is wired; real embedding Provider write/recall acceptance remains open. The 2026-09-18 zero-row measurement is a pre-fix baseline, not the current write-path status. **B2** completion weighting is fixed (`01546fdea`).
  - **R1**: native screenshot/audio build contracts and audio release packaging were connected; screenshot packaged-runtime acceptance remains open. **R2** architecture policy and cross-platform release evidence remain unresolved. **R3** large-directory scan/reconcile memory peaks remain tracked.
  - 🟡/🟢 Arch debt & cleanup: R4–R9, C1–C6.
  - Resume B1 from its current audit evidence: prove configured Provider writes and semantic recall; do not reimplement the existing writer based on the old zero-row baseline.

Keep this list current: when a finding is fixed or invalidated, check it off in the living audit with a reason.
