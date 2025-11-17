# PRD: DivisionBox 交互容器能力深化 (v1.0)

## 1. 背景与目标

- **概念澄清**: DivisionBox 基于 `WebContentsView` 动态挂载机制，是 CoreBox 的轻量化子窗口，用于承载插件 UI、系统工具与调试界面。
- **体验不足**: 现有实现缺少标准化的生命周期、状态管理与开发者 API，导致部分插件接入困难、用户操作不一致。
- **战略定位**: 将 DivisionBox 打造成统一的“浮动工作区”平台，为多视图、流转、协作能力提供基础承载层。

## 2. 用户价值与场景

- **临时工作台**: 在翻译或总结任务中弹出 DivisionBox 进行内容编辑，完成后自动收起。
- **系统工具入口**: 系统内置的调试器、日志查看器、资源监测器以 DivisionBox 形式快速调出。
- **插件调试**: 开发者可将插件预览界面挂载至 DivisionBox，与主界面并行调试。

## 3. 功能需求

### 3.1 结构化生命周期

- DivisionBox 支持 `prepare` → `attach` → `active` → `inactive` → `detach` → `destroy` 六态流转，并通过事件通知插件。
- 插件可选择 `keepAlive` 模式，允许视图在 `inactive` 时缓存以便快速恢复。
- 支持显式调用 `divisionBox.close(sessionId, options)`，包含延迟关闭、退出动画等参数。

### 3.2 状态管理

- 提供 `sessionState` 存储，与插件共享上下文（如滚动位置、草稿数据）。
- 支持系统层面保存最近使用的 DivisionBox 实例，实现“快速返回”列表。

### 3.3 布局与外观

- 标准化尺寸预设：`compact`, `medium`, `expanded`，插件可声明首选尺寸。
- 支持自定义 Header（标题、操作按钮、状态徽章），也可隐藏 Header 进入沉浸模式。
- 提供 Dock 到屏幕边缘、自动对齐的交互反馈。

### 3.4 触发与快捷操作

- DivisionBox 可由快捷键、命令面板、插件 `flow` 触发。
- 支持“最近使用”与“固定常驻”列表，在主界面快速唤起。

## 4. 非功能需求

- **性能**: 从触发到渲染出首帧 ≤ 250ms；缓存恢复 ≤ 120ms。
- **可靠性**: 任何状态切换必须保证主进程与渲染进程状态一致；异常时可自愈或回落。
- **可扩展性**: 单会话可注册最多 3 个挂载视图，支持后续多视图能力。

## 5. 技术方案概述

### 5.1 主进程管理器

- 新增 `DivisionBoxManager` 类，维护 `Map<sessionId, DivisionBoxSession>`。
- 每个 `DivisionBoxSession` 管理 `webContentsView`, `state`, `meta`, `keepAliveTimer`。
- 通过 IPC 渠道暴露 `division-box:*` 操作指令给前端与插件。

### 5.2 渲染层与 UI

- 新建 `DivisionBoxShell` Vue 组件，对应统一 UI 框架（标题区、内容区、操作区）。
- 使用 `useDivisionBoxStore` 管理会话列表、激活状态、快捷入口。
- 支持动画过渡、拖拽、对齐提示。

### 5.3 SDK 扩展

- 插件端新增 `plugin.divisionBox.open(config)`、`plugin.divisionBox.close(sessionId)`、`plugin.divisionBox.onStateChange(handler)`。
- Manifest 扩展 `divisionBox` 配置块：
  ```json
  {
    "divisionBox": {
      "defaultSize": "medium",
      "header": {
        "icon": "ri:magic-line",
        "title": "智能总结"
      },
      "keepAlive": true
    }
  }
  ```

## 6. 伪代码示例

```ts
// SDK 侧: 打开 DivisionBox
async function openDivisionBox(config: OpenDivisionBoxConfig) {
  const session = await channel.send<DivisionBoxSession>('division-box:open', config)
  cache.set(session.sessionId, session)
  return session
}
```

## 7. 实施计划

1. **[ ] Manager 架构落地**: 实现 `DivisionBoxManager` 与 Session 生命周期。
2. **[ ] UI Shell & Store**: 构建统一的 Vue 组件与状态管理。
3. **[ ] SDK 与 Manifest 扩展**: 提供插件调用 API、文档与类型定义。
4. **[ ] 缓存/恢复机制**: 引入 keepAlive 与状态持久化策略。
5. **[ ] 快捷入口与交互**: 支持 Dock、固定、最近使用等入口。
6. **[ ] 性能与稳定性**: 建立指标、压测与异常恢复方案。

## 8. 风险与待决问题

- **状态一致性**: 主进程与渲染进程状态可能出现漂移，需要心跳或确认机制。
- **KeepAlive 占用资源**: 长时间缓存的 WebContents 可能消耗内存，需要 LRU 回收与阈值控制。
- **权限模型**: 系统工具、插件都可占用 DivisionBox，需防止恶意滥用。

## 9. 验收标准

- 插件通过 SDK 成功创建、关闭、恢复 DivisionBox，并收到完整生命周期事件。
- UI Shell 支持尺寸变更、Dock、快捷入口，体验一致。
- 性能指标满足要求；连续使用 2 小时无显著内存泄漏。

## 10. 成功指标

- DivisionBox 功能上线后，相关功能的使用成功率 ≥ 97%。
- 平均唤起耗时下降 30%，用户主动反馈满意度提升。
- 插件接入比例：首月内 ≥ 5 个插件完成适配。

## 11. 后续迭代方向

- 支持多视图组合、模板保存，与 Flow Transfer 协同。
- 引入协同模式：多用户共享同一个 DivisionBox 会话。
- 打通云同步，跨设备恢复 DivisionBox 状态。
