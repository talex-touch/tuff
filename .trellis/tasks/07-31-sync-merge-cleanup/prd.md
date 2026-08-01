# 同步分支并整理代码

## Goal

在不丢失本地成果、不误合并发布/依赖机器人分支的前提下，将仓库安全同步到最新 `origin/master`，识别并整合仍有价值的本地工作，完成有明确边界的代码整理、验证、提交并推送到 GitHub。

## Background

- 2026-07-31 已执行 `git fetch --all --prune --tags` 与 `git pull --ff-only origin master`。
- 审计起点 `master`、`origin/master` 均指向 `6ff864fcd`，ahead/behind 为 `0/0`，主工作区干净；本轮已形成两个经独立任务验证的本地提交。
- 本地命名分支仅有 `master`，没有其他可直接合并的本地分支。
- 存在两个 detached 临时 worktree，均基于已被 `master` 包含的提交 `d4c0ed0c7`；其中两个未跟踪源码文件是当前 `master` 已跟踪文件的陈旧副本，另有一个未跟踪 `node_modules`，均不应灌入 `master`。
- 4 个历史 stash 已完成固定对象 ID 的文件级和语义级审计：`5291ff49e...`、`bc4a2f4e...` 已被 master 吸收；`d2b03eaf5...`、`907c8510b...` 仅保留历史备份价值。没有发现值得恢复的独立源码候选，所有 stash 保持原状。
- 远端还存在 Dependabot、`gh-pages` 和文档集成分支；文档集成分支已是当前 master 基线的祖先，其他辅助分支不属于“本地各分支”，本轮不得批量合并到 `master`。

## Requirements

1. 使用 fast-forward-only 方式同步 `origin/master`，禁止重写历史或强制推送。
2. 只整合经过审计、确认尚未被 `master` 包含且属于当前交付范围的本地成果。
3. 不把 `node_modules`、Pi checkpoint、`refs/original`、远端 Dependabot、`gh-pages` 或陈旧 detached 文件当作待合并分支。
4. 逐个审计 4 个历史 stash，按“已被 master 吸收 / 仍有独立价值 / 已过时或冲突 / 仅应保留备份”分类；禁止直接 `stash pop`，候选改动必须以临时分支或隔离 worktree 验证后再选择性整合。
5. “整理代码”采用审计驱动范围：优先整合 stash 中仍有价值、边界清晰且可验证的改动，不借机重构无关业务代码。
6. 提交前至少通过 `git diff --check`、变更文件 lint 和与变更相关的最小测试/类型检查。
7. 提交使用清晰的 Conventional Commit 信息；推送目标固定为 `origin/master`，不得使用 force 参数。
8. 完成后报告同步、合并、整理、验证、提交和推送的可审计结果。

## Constraints

- 不自动删除 detached worktree、stash、refs 或未跟踪文件；这些属于潜在破坏性清理，需要另行明确批准。
- 不合并远端机器人分支或发布分支。
- 不执行全仓无边界格式化，避免制造大规模无语义 diff。
- 若整理后没有有效源码变更，不制造空提交；仅提交本任务必要的 Trellis 记录，并如实说明。

## Acceptance Criteria

- [x] `origin` 已 fetch/prune，`master` 已通过 `git pull --ff-only` 同步。
- [x] 已盘点本地命名分支、远端分支、worktree、stash 和特殊 refs。
- [x] 用户已确认逐个审计历史 stash；detached 陈旧副本保持隔离。
- [x] 4 个历史 stash 均已完成文件级与语义级审计并形成分类结论，恢复候选为 0。
- [x] detached 陈旧工作与无恢复价值的 stash 均保持原状；未执行 apply/pop/drop 或删除。
- [x] 代码整理拆分为设置层级优化与版本历史移除两个独立提交，无无关大规模格式化。
- [x] `git diff --check`、相关 lint、测试/类型检查通过；本地 `quality:pr` 退出码为 0，并补充完成 `origin/master...HEAD` 范围的无缓存 scoped ESLint。
- [ ] 合法工作区变更已提交，`master` 已非强制推送至 `origin/master`。
- [ ] 最终 `git status --short --branch` 干净且 `master...origin/master` 为 `0/0`。

## Out of Scope

- 自动合并 Dependabot PR、`gh-pages` 或其他远端分支。
- 清空历史 stash、删除 worktree、删除 refs 或清理 Git 历史。
- 无明确目标的全仓架构重构或功能改动。

## Audit Decision

- 本次不从任何 stash 或 detached worktree 恢复源码。
- 保留两个大型 stash 作为历史保险；两个已吸收 stash 也不在本任务中删除，因为删除需要单独明确批准。
- 以固定对象 ID 和 `research/stash-audit.md` 作为后续取证依据，避免 `stash@{n}` 漂移。
