# 技术设计：同步、历史工作审计与安全整合

## 边界

本任务只处理 Git 同步、本地遗留工作审计、经确认的选择性整合、相关代码整理、验证、提交和非强制推送。远端 Dependabot、`gh-pages`、特殊 refs、生成目录及未获批准的删除不进入整合范围。

## 当前拓扑

- 权威目标：`master` / `origin/master`。
- 本地命名分支：只有 `master`。
- detached worktree：两个，基线均为已被 `master` 包含的 `d4c0ed0c7`，保持隔离。
- 历史 stash：4 个；其中两个包含 800+ tracked/untracked 路径，一个包含 546 个 tracked 路径，一个包含 24 个路径。
- 远端辅助分支：仅作为审计事实，不批量合并。

## 整合流程

### 1. 同步基线

只允许：

```bash
git fetch --all --prune --tags
git pull --ff-only origin master
```

若 master 与 origin/master 分叉，停止并重新评估；不 rebase、不 reset、不 force push。

### 2. Stash 分类

对每个 stash 比较：

1. stash 的第一父提交（原始基线）；
2. stash 保存的 tracked patch；
3. 第三父提交中的 saved untracked 文件（如存在）；
4. 当前 `master` 对相同路径的演进；
5. 相关后续提交与当前测试覆盖。

分类：

- **已吸收**：语义已在当前 master 中存在或被更完整实现替代。
- **候选选择性恢复**：当前 master 缺失、目标仍有效、边界可拆分且有验证方式。
- **仅保留备份**：无法证明价值、冲突面大、包含大量同时期快照或生成物。
- **可删除候选**：只有在用户看到证据并明确批准后才允许 `git stash drop`。

### 3. 候选恢复

禁止在主工作区直接 `stash apply/pop`。每个获批候选使用独立临时分支/worktree：

1. 从最新 `master` 创建隔离分支；
2. 按文件或最小语义块恢复，不恢复整包快照；
3. 手工适配当前接口与规范；
4. 运行最小相关测试、lint、类型检查；
5. 形成边界清晰的候选提交；
6. 回到 `master` 后通过 cherry-pick 或等价最小提交整合。

任何冲突都以当前 master 为基线，不用 `theirs` 批量覆盖。

### 4. 代码整理

代码整理只围绕获批恢复内容：移除失效重复、适配当前命名/API、补齐必要测试、通过 formatter/lint。禁止全仓格式化和无关重构。

### 5. 验证与发布

- 每个候选先运行最小相关验证。
- 最终至少运行 `git diff --check`、`pnpm lint:changed`、`pnpm quality:pr`；若质量门因既有/环境问题失败，必须区分原因并停止推送有风险的代码。
- 提交前审查 `git status`、`git diff --stat`、`git diff --cached`。
- 使用 Conventional Commit；推送仅允许 `git push origin master`。
- 推送后 fetch 并验证 `master...origin/master` 为 `0/0`。

## 回滚

- 隔离验证失败：丢弃临时候选分支/worktree，不触碰 stash。
- cherry-pick 冲突：`git cherry-pick --abort`，返回候选分支缩小改动。
- 最终验证失败：不推送，修复或回退本任务提交。
- 推送后禁止重写历史；如需回滚，使用新的 revert 提交并另行确认。

## 安全原则

- stash 在整个任务中默认只读并保留。
- 删除 worktree、stash、refs、目录均需显式用户批准。
- `node_modules`、缓存、构建产物和 Pi checkpoint 不进入提交。
