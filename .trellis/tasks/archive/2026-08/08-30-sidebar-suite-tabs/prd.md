# 文档侧边栏下划线 tab 与二级套件切换

父任务：`.trellis/tasks/08-30-docs-suite-split`（设计见父 design.md §2；步骤见父 implement.md 阶段 B）。依赖：08-30-suite-taxonomy 先完成（需要新 category 数据）。

## Goal

`DocsSidebar.vue`：一级「组件/扩展」从白底胶囊改为下划线 tab（用户图一风格，亮/暗色）；组件 tab 下新增 基础/进阶/AI 二级套件切换，一次只渲染激活套件的分类组；访问组件文档时自动定位其套件。i18n 双语补键。

## Acceptance Criteria

- [ ] 一级 tab 下划线风格，无胶囊底残留；暗色下与用户图一观感一致（激活白字+白线，未激活灰）。
- [ ] 二级切换仅在组件 tab 显示；切换过滤正确；`misc` 兜底组三套件下均为空。
- [ ] 直接打开 AI 组件 URL（如 /zh/docs/dev/components/chat）→ 元数据到达后二级切换自动落在 AI。
- [ ] 手动切套件后浏览该套件内文档不跳组；路由切到其他套件的文档时跟随路由。
- [ ] SSR/hydration 零警告（不得用 client-only 状态改变 SSR 输出结构；沿用文件内既有 hydration 注释的约束）。
- [ ] `pnpm -C apps/nexus run typecheck` 与 `pnpm -C apps/nexus test` 绿；CDP 截图验证 亮/暗 × 一二级切换。

## Out of Scope

frontmatter 与 hub（taxonomy 子任务）；扩展 tab 信息架构；Guide 区。
