# 实现敏感数据生命周期控制 #301

## Goal

定义并实现敏感数据保留、导出、删除、远程处理、备份恢复与卸载语义。

## Requirements

- Define the lifecycle contract for retained sensitive data, export, deletion, remote processing, backup recovery, and uninstall behavior; the parent issue audit confirms that these controls are not yet unified.
- Confirm product decisions for default retention periods and uninstall deletion behavior before implementation; do not assume permanent retention or immediate deletion.

## Acceptance Criteria

- [ ] The approved lifecycle contract covers retention, export, deletion, remote processing, backup recovery, and uninstall semantics without claiming implementation or verification that has not occurred.
- [ ] The task's acceptance aligns with the #301 issue mapping and the #302 tracker dependency recorded by `07-27-resolve-open-github-issues`.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
