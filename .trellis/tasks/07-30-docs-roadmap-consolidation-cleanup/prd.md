# 项目文档深度分析与 ROADMAP 沉淀及结构清理

## Goal

对仓库文档与目录结构做一次深度盘点：校准并沉淀一份可长期维护的项目 ROADMAP，优化文档导航结构，产出"不必要文件/目录"清理清单并在用户确认后执行移除。

## Background

- 上个会话已产出初版 `ROADMAP.md`（git untracked）并将 `report.md` 移入 `docs/engineering/reports/`、`docs/INDEX.md` 增加 ROADMAP 入口；这些未提交改动属于本任务的既有起点。
- 仓库存在明显杂物：`output/`（约 1.0G）、`.doc.local/`（约 76M）、`.playwright-mcp/`（约 18M）、`test-results/`、根目录散落 `tuffex.md` 等。
- `docs/` 共 125 个 md，`docs/plan-prd/` 下存在 `docs/`、`report/` 嵌套子目录，导航层级可能冗余。
- 活跃 Trellis 任务 26 个，ROADMAP 中的任务表需要与 `.trellis/tasks/` 实际状态对齐。

## Requirements

1. **深度分析**：盘点 `docs/` 全部 125 个 md 的归属、时效与重复度；盘点根目录与可疑目录的体积、git 跟踪状态与保留价值。
2. **ROADMAP 校准**：以仓库事实为准（package.json 版本、`.trellis/tasks` 真实状态、`docs/plan-prd` 各 TODO/CHANGES），修正初版 `ROADMAP.md` 中失准条目，使其成为稳定的项目全貌入口。
3. **文档沉淀**：将分析结论沉淀为持久文档（ROADMAP.md 定稿 + docs/INDEX.md 导航修正 + 必要的 docs 结构归并），不写一次性报告。
4. **结构优化**：提出并执行低风险的目录归并（如 `docs/plan-prd/docs`、`docs/plan-prd/report` 这类嵌套异味的处置建议）。
5. **清理清单**：产出分级清理清单（可安全删除 / 建议归档 / 需保留），**删除前必须经用户确认**；优先用 `git rm`/移入 archive 而非直接删除已跟踪文件。

## Constraints

- 不触碰 `.trellis/`、`apps/`、`packages/`、`plugins/` 的源码结构。
- 已跟踪文件的移动/删除必须保持 git 历史可追溯（用 `git mv`）。
- 任何删除操作（尤其 untracked 大目录）先列清单经用户确认。
- 不修复 Nexus 断链等既有 backlog 项（属于其他任务范围）。

## Acceptance Criteria

- [x] `ROADMAP.md` 内容与仓库事实一致（校准修正 10 项事实错误：Electron 41、任务优先级/状态、27 任务全景、packages 12 个、plugins 24 个、里程碑归位、B1/B2 已修）
- [x] `docs/INDEX.md` 导航准确反映最终文档结构（链接全部验证有效）
- [x] 输出 `docs/` 结构优化方案并执行经确认的归并（plan-prd/docs、plan-prd/report 两处嵌套异味已拆解归位）
- [x] 输出分级清理清单，经用户确认后完成移除（7 个 untracked 目录 ~1.1G + 20 篇 startup 流水报告 + 2 个 .DS_Store）；纯文档变更，无源码改动，构建/lint 不受影响
- [x] 所有变更通过 `git status` 可审计；无源码改动
