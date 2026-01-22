---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: 处理 stash 弹出冲突并恢复工作区
complexity: medium
planning_method: builtin
created_at: 2026-01-20T21:17:20+0800
---

# Plan: Stash 弹出恢复处理

🎯 任务概述
当前工作区存在大量已修改与未跟踪文件，导致 `git stash pop` 失败。目标是安全地恢复两个 lint-staged 备份 stash 的内容，同时避免覆盖现有改动，并在必要时保留当前工作区快照以便回退。

📋 执行计划
1. 现状盘点：确认当前 `git status -sb` 与 `git stash list`，记录两个目标 stash 的顺序与内容范围。
2. 安全兜底：先将当前工作区（含未跟踪文件）做一次临时 stash，避免覆盖现有改动。
3. 按顺序应用：优先应用较旧的 stash（`stash@{1}`），检查冲突/未跟踪覆盖提示，必要时手动解决冲突并记录影响文件。
4. 应用最新 stash：再应用 `stash@{0}`，重复冲突处理与 `git status` 校验，确保工作区一致。
5. 清理与恢复：确认两个 stash 均已成功合入后，删除对应 stash；如需恢复原工作区，再应用临时 stash 并处理可能冲突。
6. 最终验证：检查 `git status -sb`，确认没有丢失文件；如需要，输出合并后改动摘要用于后续跟进。

⚠️ 风险与注意事项
- 大量未跟踪文件可能导致 stash 应用失败或覆盖冲突，需要先临时收纳或改名。
- stash 弹出顺序不当可能引起重复冲突；建议按时间顺序从旧到新。
- 若冲突广泛，需逐个文件手动处理并确认保留版本。

📎 参考
- `issues/2026-01-20_18-52-09-config-storage-sqlite-json-sync.csv:9`
- `apps/core-app/src/main/modules/storage/index.ts:213`
