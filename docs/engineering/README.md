# Engineering Docs

> 更新时间：2026-05-14
> 定位：工程过程资料入口。压缩前快照见 `archive/README-pre-compression-2026-05-14.md`。

本目录承载工程计划、质量治理、审查、报告与历史归档，避免根目录堆积临时过程文件。

## 目录结构

- `plans/`：历史计划与专项 PRD 草案。
- `issues/`：与计划配套的 CSV 任务跟踪表。
- `code-review/`：代码审查与模块级整改清单。
- `reports/`：工程报告、盘点、审计输出与迁移记录；提交边界与 raw/local 规则见 `reports/README.md`。
- `audits/`：专项审计。
- `notes/`：工程笔记。
- `typecheck/`：类型检查修复记录。
- `archive/`：入口文档压缩前快照与后续归档。
- `coreapp-ui-contract.md`：CoreApp renderer UI 组件使用边界与 TuffEx 渐进收口规则。

## 当前维护规则

- 新工程过程资料优先放入本目录对应子目录。
- 根目录只保留 workspace 必需入口、全局配置、README、License 与发布/CI 必需文件。
- `reports/` 只提交摘要、manifest/checklist、严格验证输出与最终可复核 evidence；调试日志、pid、probe output、重复截图、临时 CDP target dump 放入对应报告目录的 `raw/` 或 `_local/`，并由 `.gitignore` 排除。
- 已进入 Git 的历史 raw 报告文件需要单独 review 后用 `git rm --cached` 从索引移除；不要在 evidence 采集过程中顺手批量删除未确认报告。
- Release notes 仍保留在根目录 `notes/`，因为 GitHub release workflow 消费该路径。
- README 展示素材仍保留在根目录 `shots/`；若迁移需同步 README 图片链接。
- 已完成或失效的工程计划不进入 `docs/plan-prd/TODO.md`，只在本目录归档或进入长期债务池。

## 与主规划文档关系

- 当前执行清单：`../plan-prd/TODO.md`
- PRD 主入口：`../plan-prd/README.md`
- 长期债务池：`../plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`
- 变更日志：`../plan-prd/01-project/CHANGES.md`
- 全局索引：`../INDEX.md`
