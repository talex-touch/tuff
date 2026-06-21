# Engineering Docs

> 更新时间：2026-06-21
> 定位：工程过程资料入口。这里只保留当前工程文档结构与 reports 提交边界。

## 目录结构

- `code-review/`：代码审查与模块级整改清单。
- `reports/`：工程报告、盘点、审计输出与 curated evidence；提交边界见 `reports/README.md`。
- `notes/`：仍有当前价值的工程笔记。
- `typecheck/`：类型检查修复记录。
- `coreapp-ui-contract.md`：CoreApp renderer UI 组件使用边界与 TuffEx 渐进收口规则。

## 维护规则

- 6 月以前工程计划、旧 issues、旧 archive 与旧 reports 已从文档树移除。
- 新工程过程资料优先进入当前专题或 `reports/`，避免根目录堆积临时过程文件。
- `reports/` 只提交摘要、manifest/checklist、严格验证输出与最终可复核 evidence。
- 调试日志、pid、probe output、重复截图、临时 CDP target dump、Chromium profile 与 user-data 放入本地 ignored evidence 目录，不纳入 Git。
- Release notes 仍保留在根目录 `notes/`，因为 GitHub release workflow 消费该路径。
- README 展示素材仍保留在根目录 `shots/`；若迁移需同步 README 图片链接。

## 主规划入口

- 当前执行清单：`../plan-prd/TODO.md`
- PRD 主入口：`../plan-prd/README.md`
- AI Stable：`../plan-prd/TODO-AI.md`
- R3 Runtime：`../plan-prd/TODO-R3.md`
- Nexus Performance：`../plan-prd/TODO-nexus.md`
- 变更日志：`../plan-prd/01-project/CHANGES.md`
- 全局索引：`../INDEX.md`
