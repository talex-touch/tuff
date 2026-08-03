# 补齐 TxResizeBox Nexus 文档

## Goal

为新增的 `TxResizeBox` 提供可发布的 Nexus 双语组件文档和可运行 Demo，使组件在文档侧栏、MDC 内容查询和按需组件加载链路中完整可发现、可试用、可核验。

## Background

- `packages/tuffex/packages/components/src/resize-box/` 已包含组件、类型和聚焦测试，并通过 `components.ts` 导出。
- Nexus 当前没有 `resize-box.en.mdc` / `resize-box.zh.mdc`、Demo loader、全局按需组件注册或侧栏条目。
- `TxResizeBox` 是显式宽高目标的 CSS transition 容器，与基于 `ResizeObserver` 自动测量内容的 `TxAutoSizer` 边界不同，文档必须明确二者适用场景。

## Requirements

- 新增中英文 `ResizeBox` 文档页，frontmatter、章节和 API 覆盖保持对称。
- 文档必须覆盖 `as`、`width`、`height`、`duration`、`easing`、`disabled`、`clip`、默认 slot、`resize-start` / `resize-end` 以及暴露的 `rootEl` / `animating`。
- 新增一个真实交互 Demo，展示紧凑/展开尺寸切换、动画生命周期、禁用后即时跳变和 overflow clipping；布局在窄屏下不得横向溢出。
- 在 Nexus 的 demo registry、TuffEx 按需全局注册和 DocsSidebar `Primitives` 分组中注册 `TxResizeBox`。
- 文档明确 `TxResizeBox` 只动画显式尺寸；内容驱动的自动测量应使用 `TxAutoSizer`。
- 不重新设计 `TxResizeBox` 运行时；将已完成的组件、类型、聚焦测试和 `components.ts` 导出作为本发布单元的前置 commit 提交。
- Nexus 文档改动不得带入 CoreApp 快捷键及其他并行任务文件。

## Acceptance Criteria

- [x] 现有 `TxResizeBox` 组件、类型、测试和导出以独立 TuffEx commit 纳入发布，聚焦组件测试通过。
- [x] `/zh/docs/dev/components/resize-box` 与 `/en/docs/dev/components/resize-box` 均可被 Nuxt Content 查询并渲染。
- [x] Demo loader 可解析并挂载 `TxResizeBox`，交互可触发尺寸和生命周期状态变化。
- [x] 侧栏在 `Primitives` 中展示 ResizeBox，且按需加载映射包含 `@tuffex-components/resize-box`。
- [x] 中英文 API 表、事件、Expose、交互契约与源码一致。
- [x] Nexus focused checks、MDC fence check、typecheck、scoped lint 与 `git diff --check` 通过。

## Out of Scope

- 重新设计或扩展 `TxResizeBox` 的运行时行为。
- 将 ResizeBox 合并进 AutoSizer，或调整其他 TuffEx 组件文档。
- 提交 CoreApp 快捷键及其他并行工作。
