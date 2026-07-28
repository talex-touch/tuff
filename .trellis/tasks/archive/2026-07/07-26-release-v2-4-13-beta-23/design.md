# 发布设计

## Release Boundary

发布分两段执行：先完成当前 batch-commit 任务的业务与规范提交，再进入版本发布任务。版本提交只包含版本文件与 lockfile；annotated tag 指向版本提交。

## Data Flow

```text
validated local commits
  -> clean master
  -> version sync to 2.4.13-beta.23
  -> release commit
  -> push origin/master
  -> push v2.4.13-beta.23
  -> Build and Release workflow
  -> signed manifest/assets
  -> GitHub prerelease
  -> Nexus release sync
```

## Safety

- 使用仓库 `scripts/version-sync.mjs`，不手工拼接 tag/版本文件。
- 推送前确认远端不存在目标 tag，且本地分支可 fast-forward 推送。
- workflow 失败时保留提交/tag 和失败证据，不删除或改写历史；修复后使用新提交或新的 beta 版本。
- GitHub Release 成功前不声明发布完成。

## Validation

- focused tests：AppProvider 分块写入、onboarding setup flow。
- package gate：`pnpm install --frozen-lockfile --ignore-scripts`、`pnpm lint:changed`、`git diff --check`。
- release state：包版本、tag 指针、远端 master、Actions run、Release prerelease/asset manifest。
