# 执行计划

## 阶段 A：审计（只读）

- [x] 运行 `git fetch --all --prune --tags`。
- [x] 运行 `git pull --ff-only origin master`。
- [x] 盘点 local/remote branches、worktrees、stash、special refs。
- [x] 完成 `research/stash-audit.md`，逐个 stash 给出证据和分类。
- [x] 核对 detached worktree 不进入本轮整合，且不删除其内容。
- [x] 审计结论为恢复候选 0；所有 stash 保持原状，无需进入隔离恢复。

## 阶段 B：隔离恢复（无候选，跳过）

- [x] 未发现值得恢复的独立源码成果，因此未创建恢复分支/worktree。
- [x] 未执行 `stash apply/pop/drop`，未恢复生成物、缓存、过期任务快照或无关改动。
- [x] 保留所有 stash 和 detached worktree 供后续经批准的取证。

## 阶段 C：整合到 master

- [x] 确认整合前 `master` 与 `origin/master` 未分叉。
- [x] 将工作区成果拆分为 `0efd10533`（设置层级优化）与 `80c44ade4`（版本历史移除）两个独立提交。
- [x] 未发生 cherry-pick/merge 冲突，也未使用 `theirs` 批量覆盖。
- [x] 已审查两个提交的 staged diff、变更统计与提交钩子结果。

## 阶段 D：质量门

按顺序执行：

```bash
git diff --check
pnpm lint:changed
pnpm quality:pr
```

若变更触及特定包，再按 owning package 规范运行其最小类型检查/测试。若只剩 Trellis/研究文档，则运行文档验证与 `git diff --check`，不伪造源码测试需求。

## 阶段 E：提交与推送

- [x] 使用 Conventional Commit 提交已验证变更。
- [x] 确认不存在 secret、缓存、`node_modules`、生成物或大文件误入。
- [ ] 执行 `git push origin master`，禁止 force 参数。
- [ ] 再次 fetch 并验证：

```bash
git status --short --branch
git rev-list --left-right --count master...origin/master
```

预期工作区干净，ahead/behind 为 `0 0`。

## 审查门

- 未完成 stash 审计，不开始恢复。
- 未经用户选择具体候选，不开始恢复。
- 未通过相关最小验证，不进入 master。
- 未通过最终质量门，不推送业务代码。

## 回滚点

1. 隔离候选失败：删除临时分支/worktree需另行确认，stash 保持不变。
2. cherry-pick 冲突：执行 `git cherry-pick --abort`。
3. 提交前失败：恢复本任务改动，不触碰历史 stash。
4. 已推送回滚：禁止改写历史，另行批准后使用 revert。
