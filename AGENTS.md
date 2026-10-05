# Project Engineering Instructions

Use Comet Native for project changes on omp, Claude Code, and Codex. `/comet` is the shared entry point; do not invoke retired task lifecycle commands.

## Workflow and Knowledge

- Read `docs/engineering/specs/frontend/index.md` or `docs/engineering/specs/main-process/index.md` before editing the corresponding layer, and follow the applicable checklists.
- Shared engineering guides live under `docs/engineering/specs/guides/`; product plans remain under `docs/plan-prd/`.
- `.comet/config.yaml` declares Native-only, Chinese artifacts, batch clarification, and explicit archive confirmation.
- `docs/comet/changes/` holds active changes, `docs/comet/specs/` holds confirmed capability behavior, and `docs/comet/archive/` holds delivery records. `.comet/runtime/` is local execution state, not project knowledge.
- Resume from the change's `comet-state.yaml` and Runtime continuation, never infer passed acceptance from an old conversation. Check the bound branch/worktree before writing.
- Read `docs/engineering/workflow/backlog.md` for frozen pre-cutover work. These records are not active Comet changes; select a real goal and confirm its current scope before taking it over.
- Use the pinned CLI with `mise exec -- comet`. Install only the three approved project targets: `oh-my-pi`, `claude`, and `codex`.
- Verify the changed behavior in its actual runtime. Archive confirmation does not authorize Git commit, merge, push, PR creation, or release; those require explicit user authorization.
- Preserve concurrent changes and user configuration. Do not install unused platform integrations or copy local runtime/logs into formal artifacts.

Project Skill roots are `.omp/skills/`, `.claude/skills/`, and `.agents/skills/`; Codex-specific hooks and rules remain under `.codex/`.

## Standing Audits / Known Issues

Before touching **search / file-indexing / cross-platform** code, read the living audit backlog — it tracks confirmed defects and prioritized risks with `file:line` references so you don't re-discover or re-introduce them:

- **Search & cross-platform audit** → [`docs/engineering/reports/search-crossplatform-audit.md`](docs/engineering/reports/search-crossplatform-audit.md)
  - **B1**: the main-process embedding writer is wired; real embedding Provider write/recall acceptance remains open. The 2026-09-18 zero-row measurement is a pre-fix baseline, not the current write-path status. **B2** completion weighting is fixed (`01546fdea`).
  - **R1**: native screenshot/audio build contracts and audio release packaging were connected; screenshot packaged-runtime acceptance remains open. **R2** architecture policy and cross-platform release evidence remain unresolved. **R3** large-directory scan/reconcile memory peaks remain tracked.
  - 🟡/🟢 Arch debt & cleanup: R4–R9, C1–C6.
  - Resume B1 from its current audit evidence: prove configured Provider writes and semantic recall; do not reimplement the existing writer based on the old zero-row baseline.

Keep this list current: when a finding is fixed or invalidated, check it off in the living audit with a reason.

<comet-ambient-resume>
<!-- Managed by Comet. Edits inside this block may be replaced by comet init/update. -->
<!-- Contract: comet.resume_probe.v2 -->

## Comet Ambient Resume

在这个仓库中，开始处理需要改动或调查的任务前，如果可能存在活跃 Comet workflow，把当前用户请求传入只读探针：`comet resume-probe . --stdin --json`。

- 如果用户通过宿主明确调用任意 Comet Skill（例如 `@comet`、`/comet`、`@comet-native` 或 `/comet-hotfix`），显式调用优先于本恢复协议；不要运行 resume probe，直接进入被调用的 Skill。
- 如果用户通过宿主明确调用的是非 Comet 的 Skill 或斜杠命令，任务意图已由该调用明确：不要运行 resume probe，直接执行该 Skill。
- 如果你正在 Comet 流程内（包括正在等待用户回复你在流程中提出的问题），不要运行 resume probe；把这类回复（例如方案/选项选择）当作当前 change 的继续，直接按用户的选择推进。
- 只信任返回的 `workflow`、`skill` 和 `entrySource`；它们只由项目配置或无配置兼容回退决定。不得扫描或切换另一套 workflow。
- 如果 probe 返回 `auto_resume`，简短说明选中的 active change，并进入 `nextCommand` 指向的永久入口。不要把状态命令当作恢复入口直接推进。
- 如果 probe 返回 `ask_user`，只问一个简短问题并等待用户回复。
- 如果当前请求未明确调用 Comet Skill，且 probe 返回 `out_of_scope` 或 `none`，不要进入 Comet workflow。
- `out_of_scope` 或 `none` 只表示不要因为这个新请求进入 Comet workflow；它绝不表示要暂停或退出一个已在进行的 Comet 流程。
- 如果配置或状态无效且没有 `nextCommand`，停止并报告原因；不要猜测另一个 workflow。
- 不能只因为存在 active change 就把无关任务挂到该 change。Native 的未提交改动由 Native 入口检查，不由探针自动归因。
</comet-ambient-resume>
