# Division Box 功能分析与开发计划 (修订版)

## 1. 核心概念修正

经过深入分析，对 `Division Box` 的理解已修正。它并非传统意义上的“分离窗口”，而是通过一种更高效的 **“动态视图挂载”** 机制实现的。

其核心是利用 Electron 的 `WebContentsView` 技术，将一个独立的Web内容视图（通常是插件的UI）动态地“附加”到一个预先存在的、类型为 `panel` 的 `CoreBox` 浮动窗口中。

这种方式的优势在于：
*   **性能开销小**: 避免了频繁创建和销毁 `BrowserWindow` 的系统开销。
*   **状态管理简化**: UI视图的状态由其自身的 `WebContents` 管理，无需复杂的跨窗口状态迁移。
*   **响应迅速**: 窗口本身是复用的，只需加载和卸载 `WebContentsView`，用户体验更流畅。

## 2. 工作流 (修订版)

```mermaid
sequenceDiagram
    participant User as 用户
    participant Frontend as 前端 UI
    participant WindowManager as 后端窗口管理器
    participant CoreBoxWindow as CoreBox 浮动窗口

    User->>Frontend: 执行一个需要展示UI的 Item
    Frontend->>WindowManager: 请求 attachUIView(plugin_url)
    
    subgraph WindowManager 内部操作
        WindowManager->>WindowManager: 创建 WebContentsView
        WindowManager->>WebContentsView: 加载 plugin_url
        WindowManager->>CoreBoxWindow: contentView.addChildView(WebContentsView)
        WindowManager->>CoreBoxWindow: 调整窗口尺寸以适应UI视图
    end

    CoreBoxWindow-->>User: "展开"并显示插件UI

    User->>Frontend: 完成操作或请求关闭
    Frontend->>WindowManager: 请求 detachUIView()

    subgraph WindowManager 内部操作
        WindowManager->>CoreBoxWindow: contentView.removeChildView(WebContentsView)
        WindowManager->>CoreBoxWindow: 调整窗口尺寸恢复原状
    end

    CoreBoxWindow-->>User: "收缩"并隐藏插件UI
```

## 3. 核心代码文件

*   **窗口管理器**: `apps/core-app/src/main/modules/box-tool/core-box/window.ts` (核心类 `WindowManager`，实现了 `attachUIView` 和 `detachUIView`)
*   **窗口配置**: `apps/core-app/src/main/config/default.ts` (定义了 `BoxWindowOption`)
*   **窗口封装**: `apps/core-app/src/main/core/touch-core.ts` (定义了 `TouchWindow`)

## 4. 后续开发计划 (TODO) - 修订版

基于新的理解，重新制定开发计划，详见 `update_todo_list` 中的具体任务。