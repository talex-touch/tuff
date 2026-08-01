# 分支同步与代码整理报告

## 结果摘要

- 远端同步基线：`origin/master` = `6ff864fcd`。
- 本地 `master` 在推送前线性领先 2 个提交、落后 0：
  - `0efd10533 feat(settings): streamline advanced configuration`
  - `80c44ade4 ref(update): remove version history browser`
- 本地命名分支仅有 `master`，本轮没有 merge commit、rebase、history rewrite 或 force push。
- 4 个历史 stash 均完成固定对象 ID 审计，恢复候选为 0；未执行 `apply`、`pop`、`drop`。
- 两个 detached worktree 保持隔离；陈旧源码和未跟踪 `node_modules` 符号链接均未进入提交。

## 分支审计

- `origin/master`：本轮目标分支。
- `origin/TalexDreamSoul/docs-remediation-integration`：已经是当前 master 基线的祖先；它不是本轮新增 merge，也无需再次合并。
- Dependabot 分支：不是 master 祖先，本轮未合并。
- `origin/gh-pages`：发布站点分支，不是 master 祖先，本轮未合并。
- `refs/original`、Pi checkpoint、stash：不是待合并本地分支，本轮未改动。

## Stash 处置

完整证据见 `research/stash-audit.md`。

| 固定对象 | 分类 | 本轮处置 |
|---|---|---|
| `5291ff49e375cc618984e9cb247d7320b2f0c319` | 已吸收 | 保留，不恢复 |
| `d2b03eaf5438bbb1f7a7caddca8f77edffcee4c7` | 仅历史备份 | 保留，不恢复 |
| `907c8510bb4203731398dd105d3872262c13cac7` | 仅历史备份 | 保留，不恢复 |
| `bc4a2f4ef824556a563b0481aa9a372cbcf948e5` | 已吸收 | 保留，不恢复 |

## 代码整理

### 设置层级与默认值

- 六个低频选项统一进入高级设置。
- 三个缺失字段默认开启，同时保留用户显式 `false`。
- 首次引导完成前，配置默认值不会触发静默启动。
- macOS 标签与设置页 12px 区块间距统一。

验证：10 个 focused 文件、85 条测试；CoreApp node/web typecheck、scoped ESLint、视觉布局检查和 `git diff --check` 通过。

### 版本历史移除

- 删除版本历史 UI、深链、远端 list/get、历史缓存、transport/SDK/type。
- 保留一次性 What's Changed 摘要和已读确认。
- 更新渠道对普通用户可见；Release 默认，Beta 明示风险；保存后强制检查新渠道。
- 渠道测试升级为真实 Vue 组件行为测试。

验证：25 个测试文件、192 条用例；CoreApp node/web typecheck、无缓存 scoped ESLint、locale parse 和 `git diff --check` 通过。

## 最终质量门

- `pnpm quality:pr`：退出码 0。
  - release notes contract：通过。
  - targeted tests：107/107 通过。
  - CoreApp typecheck node/web：通过。
- 本地 `quality:pr` 的 `lint:changed` 在未设置 `GITHUB_BASE_REF` 时只比较 `HEAD` 与工作区，不能单独证明已提交 diff。
- 已补充按 `origin/master...HEAD` 枚举变更并执行无缓存 scoped ESLint：
  - CoreApp：33 个 JS/TS/Vue 文件，通过。
  - Utils：7 个 JS/TS 文件，通过。
  - 根脚本：2 个文件，通过。
- `git diff --check`：工作区、暂存区、`origin/master..master` 均通过。
- 提交范围共 59 个文件；未发现 secret、`node_modules`、构建产物、二进制或异常大文件，最大 blob 约 243 KB。

## 推送状态

本报告首次提交时尚未推送。推送后将在本文件补记远端 HEAD、ahead/behind 与最终工作区状态。
