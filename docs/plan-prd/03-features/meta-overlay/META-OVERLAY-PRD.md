# MetaOverlay 三层架构 PRD

## 概述

MetaOverlay 是一个悬浮在 CoreBox 最上层的操作面板系统，提供统一的操作入口。它采用三层 WebContents 架构，确保能够覆盖插件 UI 层。

## 架构设计

### 三层结构

```
┌─────────────────────────────────────────────┐
│          MetaOverlay WebContentsView        │ ← 顶层（操作面板）
│    （悬浮操作面板，可被 footer 调用展示）       │
├─────────────────────────────────────────────┤
│          Plugin WebContentsView (uiView)    │ ← 中层（插件内容）
│                                             │
├─────────────────────────────────────────────┤
│          CoreBox 主渲染进程                  │ ← 底层（搜索框 + footer）
│    ┌─────────────────────────────────────┐  │
│    │          搜索输入框 (60px)           │  │
│    └─────────────────────────────────────┘  │
│    ┌─────────────────────────────────────┐  │
│    │          CoreBoxFooter              │  │
│    └─────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 层级说明

| 层级 | 组件 | 位置 | 职责 |
|-----|------|-----|-----|
| 顶层 | MetaOverlay WebContentsView | 覆盖整个窗口 | 悬浮操作面板、扩展内容 |
| 中层 | Plugin WebContentsView (uiView) | y=60 开始 | 插件 Surface 展示 |
| 底层 | CoreBox 主渲染进程 | 完整窗口 | 搜索框 + 结果列表 + Footer |

## 功能特性

### 1. 操作来源（三层合并）

操作列表由三个来源合并而成：

- **内置操作**（优先级 0）：固定到推荐、复制名称、在 Finder 中显示、流转到其他插件
- **item.actions**（优先级 50）：当前选中项的自定义操作
- **插件全局操作**（优先级 100）：插件通过 MetaSDK 注册的全局操作

### 2. 搜索过滤

- 支持标题匹配
- 支持副标题匹配
- 支持模糊搜索（拼音/首字母）
- 前端实现，无需后端支持

### 3. 快捷键处理

- 仅在 MetaOverlay 打开时响应快捷键
- 支持直接按快捷键执行对应操作
- 支持上下键导航、Enter 执行

### 4. ESC 键优先级

```
1. MetaOverlay 可见 → 关闭 MetaOverlay（最高优先级）
2. Plugin UI 模式 → 退出 UI 模式
3. 有搜索内容 → 清空搜索
4. 其他 → 隐藏 CoreBox
```

## UI 设计

### 布局结构

```
┌─────────────────────────────────────────────┐
│ 🔍 搜索操作...                         ⌘K │  ← 操作搜索框（焦点）
├─────────────────────────────────────────────┤
│ 列表                                        │  ← 分组标题
├─────────────────────────────────────────────┤
│ ⟲  刷新历史                                │  ← TuffRenderDSL 条目
│    重新拉取剪贴板记录                        │
├─────────────────────────────────────────────┤
│ ▽  打开筛选                                 │
│    当前：全部内容                            │
├─────────────────────────────────────────────┤
│ ◇  固定到推荐                          ↵   │  ← 快捷键标识
│ ⎘  复制名称                           ⌘C   │
│ 📁 在 Finder 中显示                  ⌘⇧F   │
│ ↗  流转到其他插件                    ⌘⇧D   │
├─────────────────────────────────────────────┤
│           ↑↓ 选择  Enter 执行  Esc 关闭     │  ← Footer 提示
└─────────────────────────────────────────────┘
```

### 简化版 TuffRenderDSL

用于 MetaOverlay 操作列表渲染，不支持 widget：

```typescript
interface MetaActionRender {
  basic: {
    title: string           // 操作标题
    subtitle?: string       // 操作描述
    icon?: TuffIcon         // 图标
  }
  shortcut?: string         // 如 '⌘C', '⌘⇧F'
  group?: string            // 分组标题，如 '列表'
  disabled?: boolean        // 是否禁用
  danger?: boolean          // 危险操作（红色）
}
```

## 技术实现

### 主进程

- **MetaOverlayManager**: 管理 MetaOverlay WebContentsView 的生命周期
- **常驻模式**: MetaOverlay 随 CoreBox 窗口创建，通过 `setVisible()` 控制显示/隐藏
- **z-index 控制**: 通过 `addChildView` 顺序确保 MetaOverlay 在最上层

### 渲染进程

- **MetaOverlay.vue**: 主视图组件
- **MetaActionItem.vue**: 操作条目组件（基于 TuffRenderDSL）
- **路由**: `#/meta-overlay`

### 通信

- **TuffTransport**: 使用类型安全的事件系统
- **IPC 通道**: `meta-overlay:ui:show`, `meta-overlay:ui:hide`, `meta-overlay:action:execute`

## 使用场景

### 1. Footer 触发（⌘K）

用户按 ⌘K 时，Footer 调用 MetaOverlay 显示操作面板。

### 2. 插件注册全局操作

插件可以通过 MetaSDK 注册全局操作，这些操作会出现在所有 item 的操作面板中。

### 3. Item 自定义操作

Item 可以通过 `meta.actions` 定义自定义操作。

## 验收标准

1. ⌘K 能打开 MetaOverlay，焦点在搜索框
2. 操作列表正确合并：内置 + item.actions + 插件全局
3. 搜索框支持标题/副标题/拼音模糊过滤
4. 上下键选择、Enter 执行、快捷键直接执行
5. ESC 仅关闭 MetaOverlay，不退出 UI 模式
6. 插件能通过 MetaSDK 注册全局操作
7. 样式与设计图一致

