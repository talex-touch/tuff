# 组件文档三套件重分类

父任务：`.trellis/tasks/08-30-docs-suite-split`（归属总表在父 prd.md，为唯一事实来源；设计见父 design.md §1；步骤见父 implement.md 阶段 A）。

## Goal

158 篇组件文档的 frontmatter `category` 按父任务归属总表重写（新增 Advanced/Visualization/AiChat/AiAgent/AiReasoning/AiContext 六个分类值），hub index 双语页按三套件重组，`recategorize-component-docs.py` 更新为新 TAXONOMY 并保持幂等。

## Acceptance Criteria

- [ ] TAXONOMY 与父 prd 归属总表逐 slug 一致；脚本重跑幂等（二次运行零 diff）。
- [ ] 所有 `*.{zh,en}.mdc` 仅 `category:` 行变化；正文零改动。
- [ ] hub `index.{zh,en}.mdc` 三套件章节化后链接集合与改前完全一致（零丢失、零新增幻影链接）；zh/en 结构对等。
- [ ] `pnpm -C apps/nexus test`（含 tuffex-component-docs-coverage）与 `check:mdc-fences` 绿。
- [ ] 无任何 slug 落入「未分类」：TAXONOMY 覆盖 = 磁盘上全部组件文档（index 除外）。

## Out of Scope

侧边栏渲染（子任务 sidebar-suite-tabs）；tuffex barrel（子任务 tuffex-suite-entries）。
