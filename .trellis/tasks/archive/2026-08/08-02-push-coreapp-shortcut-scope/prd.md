# 推送 CoreApp 快捷键作用域修复

## Goal

核对并将已提交、已验证、已归档的 CoreApp 快捷键作用域修复提交推送到 origin/master，不修改代码。

## Requirements

- 仅推送当前 `master` 已存在的 CoreApp 快捷键作用域相关提交，不创建或修改产品代码。
- 推送目标固定为 `origin/master`，使用普通非强制推送。
- 推送前确认工作区除本任务元数据外无未提交代码，并确认本地仅领先预期的三笔提交。
- 推送后确认 `origin/master` 与本地工作提交一致。

## Acceptance Criteria

- [x] `d8549845f`、`432b6665e`、`477564f35` 已出现在 `origin/master`。
- [x] 推送未使用 force 参数，且远端校验显示工作提交无 ahead/behind 偏差。
- [x] 除本任务元数据外工作区干净，可安全执行 Trellis 归档。

## Verification Evidence

- `git push origin master`：`45467b9a0..477564f35 master -> master`。
- `git rev-list --left-right --count origin/master...master`：`0 0`。
- 本地与远端 SHA 均为 `477564f35aabea777aa2221392ac473a22c40b38`。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
