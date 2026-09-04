# 文档侧边栏 nav item 极简风格改造

轻量任务（PRD-only）。上承 08-30-docs-suite-split（tab 已改下划线风）；本轮把左侧 nav 列表本体改成用户参考图的极简风（Tailwind docs 风格）。

## 参考图要点（2026-08-30 用户提供）

- 分组标签：小号大写灰字（letter-spacing 加宽），无折叠箭头视觉、无计数徽章。
- 条目：纯文字链接，行距疏朗，无左侧竖向导轨线、无激活左指示条、无背景块。
- 激活态：纯粗体近黑；未激活中灰；hover 加深。

## Requirements

- R1 `DocsSidebar.vue`：去掉 `.docs-nav-list::before` 竖线与 `.docs-nav-link::before` 左指示条；条目字号/行距按参考图放大（≈13px / py↑）；激活=粗体近黑无背景。
- R2 分组头（`DocSection.vue` + DocsSidebar header slot）：小号大写灰标签样式（CJK 不受 uppercase 影响，同尺寸同色即可）；移除头部计数徽章（`docs-nav-section-count`）；折叠交互保留（点击仍可折叠），箭头弱化或悬停才现。
- R3 sync 徽章（AI迁移/开发中）保留但弱化到不干扰参考图观感。
- R4 亮/暗双色；暗色规则必须用 `:global(.dark .foo)` 整体形式（见 spec 尾节陷阱）。
- R5 教程（guide）与扩展 tab 共用同一渲染链，风格随之统一，无行为回归；hydration 不受影响（纯样式+模板微调）。

## Acceptance Criteria

- [ ] CDP 截图（亮/暗 × 组件/扩展）与参考图风格一致：无竖线、无指示条、无计数徽章、分组标签大写灰、激活纯粗体。
- [ ] 折叠交互仍可用；suite 切换、自动定位不回归。
- [ ] `pnpm -C apps/nexus run typecheck` 绿；eslint 改动文件绿。
