# Engineering Docs

本目录承载工程过程资料与质量治理记录，避免根目录继续堆积临时计划、问题追踪与审查输出。

## 目录结构

- `plans/`：历史计划与专项 PRD 草案，保留原文件名以便追溯。
- `issues/`：与计划配套的 CSV 任务跟踪表。
- `code-review/`：代码审查与模块级整改清单。
- `reports/`：工程报告、盘点、审计输出与迁移记录。
- `audits/`、`notes/`、`typecheck/` 等：已有工程治理专题目录。

## 维护规则

- 新的工程过程资料优先放入本目录下的对应子目录。
- 根目录只保留 workspace 必需入口、全局配置、README、License 与发布/CI 必需文件。
- Release notes 仍保留在根目录 `notes/`，因为 GitHub release workflow 直接消费该路径。
- README 展示素材仍保留在根目录 `shots/`，后续若迁移需同步更新 README 图片链接。
