# PRD: 插件系统 "View Mode" 与开发模式增强 (v2.0)

## 1. 背景与目标

当前插件系统需要一种机制，允许插件开发者声明一个 `feature` 作为一种特殊的 **“视图模式” (View Mode)**。当用户触发此类 `feature` 时，系统应自动展开主窗口并加载一个由该插件提供的 Web UI 界面。

此功能需要一个高度健壮、安全且对开发者友好的实现，能够无缝支持 **生产环境** 和 **开发环境**，并能优雅地处理各种异常情况。

## 2. 核心功能需求 (Features)

### 2.1. 声明式的视图模式

- 插件应能在其 `manifest.json` 的 `feature` 定义中，通过一个 `interaction` 对象来声明一个视图。
- **`interaction.path` 规范化**: 系统将自动规范化 `path` 值，为其添加缺失的前导斜杠 (`/`)。

### 2.2. “混合模式”的插件加载机制

- **权威来源**:
  1.  **本地优先**: 加载流程始于本地 `plugins/<plugin-name>/manifest.json`。
  2.  **远程覆盖**: 若 `dev.enable` 为 `true`，系统将尝试从 `dev.address + '/manifest.json'` 获取远程配置。
  3.  **失败回退与警告**: 若远程配置获取失败，系统回退使用本地配置，并向 `plugin.issues` 添加一条包含 `code`、`suggestion` 和 `timestamp` 的详细警告。

### 2.3. `dev.source` 开关

- `dev.source: false` (调试模式): 加载本地资源，监听本地文件变更。
- `dev.source: true` (源码开发模式):
    - **安全开关**: 此模式需要一个全局的应用级设置“允许插件源码开发模式”和插件自身的 `dev.source: true` 同时开启才能激活。
    - **加载策略**: 忽略本地资源，所有请求通过 HTTP 指向 `dev.address`。
    - **UI警示**: 在此模式下打开的任何 `view` 窗口，顶部都必须显示一个不可关闭的红色横幅，提示用户“插件处于源码开发模式”。

### 2.4. 智能且安全的视图 URL 构造

- **源码开发模式 (`dev.source: true`)**:
  - **URL**: `http://<dev.address><interaction.path>`
- **其他模式 (调试/生产)**:
  - **URL**: `file://<plugin_path>/index.html#<interaction.path>`
  - **路由模式限制**: 在 `file://` 模式下，如果 `interaction.path` 存在，系统会强制使用 Hash 路由。若插件未使用 Hash Router，加载将被拒绝并上报 issue。
- **生产环境协议限制**: 在生产环境中，系统将禁止加载任何 `http://` 或 `https://` 协议的插件视图，以防开发配置泄露。

### 2.5. 健壮的 Webview 生命周期管理

- **多实例追踪**: `IPluginWebview` 将被改造为 `Map<number, ...>` 结构，以追踪每个 `webContents` 实例及其关联的 `feature` 和上下文。
- **内存泄漏防治**: 当 webview 窗口关闭时，系统必须确保从 Map 中移除其条目，并移除所有相关的事件监听器 (`win.removeAllListeners()`)。

### 2.6. Dev Server 健康探测与断连处理

- **心跳机制**: 对于 `dev.source: true` 的活跃插件，`PluginManager` 将启动一个定时器，通过请求 `/_tuff_devkit/update` 来探测 Dev Server 的健康状况。
- **超时与重试**: 健康探测具有 1.5 秒超时和 1 次即时重试策略。
- **断连处理**:
  - 若探测失败，插件状态更新为 `DEV_DISCONNECTED`。
  - 已打开的 `view` 窗口**不会被强行关闭**。
  - 系统会向其发送 IPC 消息，触发视图内部UI提示“与开发服务器的连接已断开”。

## 3. 架构与技术方案

### 3.1. 类型定义增强 (`packages/utils/plugin/index.ts`)

- **`IPluginDev`**: 增加 `source?: boolean` 并补充 TSDoc。
- **`IFeatureInteraction`**: 补充 TSDoc，明确 `path` 的作用。
- **`IPluginWebview`**: 改造为 `Map<number, { featureId: string; window: BrowserWindow; }>`。
- **`PluginIssue`**: 扩展接口，增加 `code?: string`, `suggestion?: string`, `timestamp: number`。

### 3.2. 代码结构重构 (`apps/core-app/src/main/plugins/`)

- 将 `plugin-core.ts` 按职责拆分为 `plugin-manager.ts`, `plugin.ts`, `plugin-feature.ts`, `plugin-icon.ts` 和 `index.ts`。

### 3.3. 流程图

```mermaid
graph TD
    subgraph CoreBoxManager.execute
        A[用户执行'多源翻译'] --> B{获取插件实例};
        B --> C{生产环境 & URL是http?};
        C -->|是| C_FAIL[拒绝执行, 上报错误];
        C -->|否| D{检查 dev.enable & dev.source};
        D -->|true & true (源码开发)| E[baseUrl = dev.address];
        E --> F[finalUrl = baseUrl + normalize(path)];
        D -->|其他情况| G[baseUrl = 'file://' + pluginPath + '/index.html'];
        G --> H[finalUrl = baseUrl + '#' + normalize(path)];
        F --> I[调用 enterUIMode(finalUrl)];
        H --> I;
    end

    subgraph PluginManager.loadPlugin
        J[读取本地 manifest] --> K{dev.enable === true?};
        K -->|是| L[HTTP GET dev.address + '/manifest.json'];
        L --> M{请求成功?};
        M -->|是| N[使用远程 manifest 覆盖];
        M -->|否| O[添加失败警告, 回退到本地];
        K -->|否| P[使用本地 manifest];
        N --> Q[继续加载];
        O --> Q;
        P --> Q;
    end
```

## 4. 实施计划 (TODO List)

1.  **[ ] (结构) 拆分 `plugin-core.ts`**
2.  **[ ] (类型) 增强 `IPluginWebview`, `IPluginDev`, `PluginIssue` 等类型定义并添加 TSDoc**
3.  **[ ] (核心) 改造插件加载逻辑 (`plugin-manager.ts`)**，实现远程 manifest 覆盖、失败回退、日志规范化。
4.  **[ ] (核心) 实现 Dev Server 健康探测机制**，包括超时、重试和断连处理。
5.  **[ ] (核心) 改造 `CoreBoxManager` 执行逻辑 (`manager.ts`)**，实现安全的 URL 构造、协议限制和路由模式检查。
6.  **[ ] (配置) 配置 `touch-translation` 插件**，添加 `dev` 配置 (`source: true`) 和“多源翻译” `view` feature。

## 5. 验收标准

- **功能**: `view` 模式在生产、调试、源码开发三种模式下均能按预期工作。
- **健壮性**: Dev Server 启动失败、中途断开等异常情况能被系统优雅处理，并给出清晰的用户提示和日志记录。
- **安全性**: 生产环境严格禁止加载 http 协议的视图；源码开发模式有明确的 UI 警示。
- **开发者体验**: `interaction.path` 能够自动规范化；issue 日志提供清晰的错误码和建议。
- **无内存泄漏**: 关闭 webview 窗口后，相关的 Map 条目和事件监听器被完全清理。