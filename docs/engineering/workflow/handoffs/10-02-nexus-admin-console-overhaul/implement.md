# Implementation Plan — Nexus 后台全面重构（父任务）

父任务不 `task.py start`。按下列顺序逐个启动子任务；每个子任务启动前必须具备 `prd.md`、`design.md`、`implement.md` 和非种子的 `implement.jsonl` / `check.jsonl`，并经老板审阅。

## 执行顺序

| 批次 | 子任务 | 可并行 | 说明 |
|---|---|---|---|
| A | #0 `nexus-admin-retired-ai-cleanup` | 与 #1 并行 | 改动集中在 `server/`、i18n、analytics 的 AI 面板；与 #1 无文件交集 |
| A | #1 `tuffex-admin-primitives` | 与 #0 并行 | 只动 `packages/tuffex` 与 Nexus 文档；合入前要老板决定 0.6.3 发版时机 |
| B | #2 `nexus-admin-console-kit` | 否 | 依赖 #1 的三个原语；以 `/admin/audits` 试点，完成后冻结组合件 API（改 API 需回到本父任务 design §2） |
| C | #3 content、#4 accounts、#5 ai-services | 三者文件不相交，可依次或并行 | 都只依赖 #2 |
| C | #8 积分、#9 插件审核、#10 发布证据 | 同上 | 依赖 #2；#10 改流水线，需老板配置 secret |
| D | #6 analytics | — | 依赖 #0（AI 面板已删）与 #2 |
| D | #7 governance | — | 依赖 #2；体量最大，单独一批 |
| E | #11 risk-console | — | 依赖 #2、#5（AI 概览已迁移，手动封禁区块由本任务迁走） |
| E | #12 emergency-chain | — | 依赖 #11（风控页结构、`useAdminStepUp`） |
| F | 父任务集成复核 | — | 见下 |

并行注意：共享工作树里有其它会话；并行子任务的 implement agent 共享同一账号额度，一次最多并行两个。

## 每个子任务的固定门（写进各自 implement.md）

1. `trellis-before-dev`：读 `.trellis/spec/frontend/index.md` 的清单（Directory Structure、Component Guidelines 含 Loading States、Hook Guidelines、State Management、Type Safety、Quality Guidelines；涉及 TuffEx 的加 TuffEx Design Rules、TuffEx Docs Sync；涉及 Provider Registry 的加 Nexus Provider + Scene Routing；涉及应急 / 密钥的加 Nexus Deployment Secrets）。
2. 实现后自检：
   - `cd apps/nexus && ./node_modules/.bin/vitest run`（全量，CI 同款）
   - Nexus typecheck（`apps/nexus/node_modules/.bin/nuxt typecheck` 会改写 `.nuxt` 并可能杀掉 :3200 dev server——运行前确认无人依赖该 dev server，或先问老板）
   - 改动文件用包内 eslint 配置检查（不要整文件 `--fix`）
   - `git diff --check`
   - 文档改动：`node apps/nexus/build/check-mdc-fences.mjs`
   - TuffEx 改动：tuffex `typecheck`、`vitest run <dirs>`、`gulp build`（先把 mise shims 放进 PATH）、`audit:size`、`audit-readme-inventory`
3. ego 验收：按父任务 design §4 第 11 条截图，存子任务 `research/`。
4. `trellis-check` 复核一遍改动范围与 spec 符合度。
5. 提交前询问老板；只暂存本子任务文件。

## 父任务集成复核（F）

- [ ] 全部子任务归档后，在一个干净分支上：Nexus 全量 vitest、typecheck、`node apps/nexus/build/check-worker-bundle.mjs`（不新增 findings；基线见 `09-23-nexus-docs-perf-cms-remediation/research/audit-2026-09-23.md` §6）。
- [ ] ego 全后台巡检一遍（沿用 `/tmp/nexus-admin-baseline/sweep.mjs`，路由表换成终态），逐项对照 `research/visual-baseline-2026-10-02.md` 的缺陷清单，写一份前后对照到本任务 `research/`。
- [ ] `component-guidelines.md:72-74` 已按终态更新；`apps/nexus/AGENTS.md` 若描述了后台约定则同步。
- [ ] Follow-ups 登记成独立任务或 issue（先建再引用，不预测编号）。
- [ ] 归档本父任务。

## 回滚点

- 每个子任务一个 PR，可独立 revert。
- #0 是唯一必须原子提交的子任务；若合入后发现 v1 AI 调用异常，直接 revert 整个 PR。
- #2 合入后组合件 API 冻结；后续子任务若需要改 API，回到本文件与 design §2 修订后再动。
