# PRD: 多插件 AttachUIView 并行共存能力 (v1.0)

## 1. 背景与目标

- **单实例限制**: 当前 `attachUIView` 机制一次仅承载一个插件 WebContentsView，用户在多个插件间切换时需要频繁关闭/打开，体验割裂。
- **多任务场景增长**: AI 工作流、翻译+写作、剪藏+知识库等场景需要同时查看多个插件界面并行操作。
- **平台一致性**: 需要构建一个统一的多视图承载框架，为后续分屏、标签、流转等高级协作能力奠定基础。

## 2. 用户价值与场景

- **对照翻译**: 用户同时打开“原文对照”和“润色建议”插件，左右对照编辑。
- **任务编排**: 任务插件与番茄钟插件并排展示，实时跟踪进度与番茄状态。
- **调试开发**: 插件开发者同时打开调试面板与实时视图，监控日志与 UI。

## 3. 功能需求

### 3.1 多视图承载

- 支持单个 CoreBox 容器内最多挂载 4 个 WebContentsView。
- 提供 **布局模式**：标签(Tab)、左右分屏(Split)、网格(Grid)。
- 用户可拖拽视图卡片调整顺序或切换布局模式。

### 3.2 生命周期管理

- 每个视图实例维护独立的 `sessionId`、激活状态、焦点。
- 支持对单个视图执行刷新、重新加载、关闭，不影响其他视图。
- 当 CoreBox 收起时保留挂载关系，再次展开恢复状态。

### 3.3 交互通知

- 激活切换事件通过 `channel.send('ui-view:focus-changed')` 通知插件。
- 插件可订阅 `ui-view:layout-update` 获取当前布局与尺寸，适配响应式。
- 支持在视图卡片上展示来源插件图标、标题、状态标签(如“离线”、“待授权”)。

### 3.4 系统降级策略

- 当系统检测到 GPU/内存压力超过阈值时，自动降级至标签模式并提示用户。
- 允许用户在设置里配置“最大并行数量”，默认 2。

## 4. 非功能需求

- **性能**: 新增视图挂载耗时 ≤ 300ms；同时渲染三个视图时，FPS 不低于 40。
- **稳定性**: 任一视图崩溃不影响其他视图；提供自动重载选项。
- **可访问性**: Tab 模式支持键盘快捷键循环切换，分屏模式可通过快捷键移动焦点。

## 5. 技术方案概述

### 5.1 CoreBox 容器改造

- 引入 `MultiViewHost`，管理 `Map<panelId, AttachedView[]>`。
- 每个 `AttachedView` 包含 `webContents`, `layoutSlot`, `state` 元信息。
- 布局由前端配置，通过 IPC 将布局描述(`layoutSpec`)同步至主进程。

### 5.2 渲染层

- 新增 `ViewDock` 组件，负责渲染标签、分屏、网格 UI 与拖拽交互。
- 通过消息 `window:attach-view` / `window:detach-view` 与主进程交互。
- 在 Vue Store 中维护 `attachedViews` 状态，支持撤销/恢复。

### 5.3 插件侧适配

- SDK 增加 `plugin.uiView.onFocusChange(handler)`、`plugin.uiView.getLayout()`。
- Manifest 新增 `uiView.supportedLayouts` 字段供插件声明首选布局。

## 6. 伪代码示例

```ts
// 主进程: 注册多视图
function attachUIView(panelId: string, descriptor: AttachDescriptor) {
  const host = multiViewHost.ensure(panelId)
  if (host.size >= host.maxViews) throw new Error('VIEW_LIMIT_EXCEEDED')

  const view = createWebContentsView(descriptor)
  host.add(view)
  host.applyLayout(currentLayoutSpec)

  return {
    sessionId: view.sessionId,
    dispose: () => host.remove(view.sessionId)
  }
}
```

## 7. 实施计划

1. **[ ] CoreBox 多视图容器**: 实现 `MultiViewHost` 与主进程布局适配。
2. **[ ] 前端 ViewDock 组件**: 支持标签、分屏、网格 UI 切换与拖拽交互。
3. **[ ] SDK & Manifest 扩展**: 新增多视图相关的事件与配置。
4. **[ ] 性能与稳定性保障**: 接入资源监控、降级策略与崩溃隔离。
5. **[ ] 体验细节打磨**: 图标状态、快捷键、动效、设置项。
6. **[ ] 端到端验证**: 构建示例插件，验证多视图协作与回退。

## 8. 风险与待决问题

- **资源竞争**: 多 WebContents 同时加载可能导致显存飙升，需要监控与限制策略。
- **布局复杂度**: 分屏、网格的尺寸同步需精确，防止 UI 抖动。
- **插件兼容性**: 旧插件未适配多视图消息，需保证后向兼容。
- **场景扩展**: 是否支持跨窗口拖出（floating pop-out）待评估。

## 9. 验收标准

- 同一 CoreBox 内成功并行挂载 3 个插件视图，无崩溃或严重掉帧。
- 用户可在 3 种布局模式间切换，并保持状态记忆。
- 插件能够正确收到焦点、布局变更事件并自适应渲染。
- 资源监控与降级策略可在压力场景下正确触发。

## 10. 成功指标

- 多视图功能启用后的一周内，相关用户操作成功率 ≥ 95%。
- 平均每位活跃用户的并行插件视图数 ≥ 1.6。
- 用户评价反馈中关于“多窗口切换麻烦”的负面反馈降低 60%。

## 11. 后续迭代方向

- 支持跨屏拖拽至外部窗口、组合成工作流场景。
- 引入布局模板，可一键保存/切换常用视图组合。
- 与流转能力结合，实现视图间数据快速流动。
