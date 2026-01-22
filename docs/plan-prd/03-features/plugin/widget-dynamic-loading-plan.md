# Widget 动态渲染策划 (v1.1)

> 更新: 2025-12-10 - 核心功能已完成

## 完成状态

| 模块 | 状态 | 说明 |
|------|------|------|
| WidgetLoader | ✅ | 源码加载与缓存 |
| WidgetCompiler | ✅ | @vue/compiler-sfc + esbuild |
| WidgetManager | ✅ | 生命周期 + chokidar 监听 |
| IPC 通道 | ✅ | register/update/unregister |
| 渲染器注册 | ✅ | widget-registry.ts |
| Dev 模式 | 🟡 | 待完善 |

## 背景
- 目前插件的 `interaction.type` 支持 `webcontent`，`apps/core-app/src/main/modules/plugin/view/plugin-view-loader.ts` 已经处理了加载 HTML 页面，但 `widget` 可以暴露更轻量的 Vue 组件，目前在 `TouchPlugin` 里只是打了个 warning。
- 插件注册自定义渲染（`setCustomRender('vue', ...)`）依赖 `apps/core-app/src/renderer/src/modules/box/custom-render` 的静态组件注册表，只有内置组件（如 `core-intelligence-answer`）被提前注册。
- 用户需求：① 内置插件（internal）可以继续预注册默认渲染；② 非 internal 的 `widget` 要从 `widgets` 目录/路径实时获取 Vue 源码、编译并加载到渲染器，做到可扩展、热更新的插件 widget 体验。

## 术语定义
- **Internal 插件**：主进程内置模块（例如 `internal-ai`）创建的 Plugin 实例，名称固定、受控、安全，渲染器可直接在启动时注册对应组件。
- **非 internal 插件**：从磁盘/网络加载的第三方或开发者插件，其 `manifest.features[]` 中可能声明 `interaction.type === 'widget'`，`interaction.path` 指向 `widgets/{name}`。
- **Widget 组件标识**：建议用 `${plugin.name}::${feature.id}` 或 `${plugin.name}::${path}` 组成唯一 `custom.content`，交给 renderer registry 使用。

## 非 internal Widget 动态加载思路（重点）
### 1. 触发点
- 用户通过命令触发 `feature.interaction.type === 'widget'` 的 feature，`TouchPlugin` 在 `onFeatureTriggered` 中需要进入 widget loader 流，而不是直接弹出 `CoreBox`。
- 由于最终渲染仍在 renderer （`CoreBoxRender`）里，我们需要在主进程开启加载/编译、再通知渲染器注册组件。

### 2. 获取源码
- 在生产模式：
  - `interaction.path` 应该指向 `widgets/<widget-name>`（可以不带扩展名，默认 `.vue`）。
  - 读取 `${plugin.pluginPath}/widgets/${path}.vue`（或 `.ts`/`.js`、`.tsx` 备用），同时禁止 `..`、禁止访问 `plugin` 目录以外路径（同 `PluginViewLoader` 的安全检查）。
- 在 Dev 模式（`plugin.dev.enable && plugin.dev.source && plugin.dev.address`）：
  - 路径可能走本地 dev server，拼 `${plugin.dev.address}/widgets/${path}.vue` 拉源码或预编译资产。
  - 需校验 `dev.address` 协议（只允许 http/https）、并在跨域时带上 token（如果有）。

### 3. 编译/运行时处理
- 使用 `@vue/compiler-sfc` 将 `.vue` 拆成 `<script>`、`<template>`、`<style>`：
  - `script` 编译为 JS，最好走 `@babel/core`/`esbuild` 进行一次转码（支持 Vue `<script setup>`）。
  - `template` 编译为 render 函数。
  - 合并 `style` 为 CSS，注入到 renderer 作用域（可以复用现有 `core/plugins` 的 CSS 注入策略）。
- 运行时需要在安全沙箱中执行编译后的 JS（类似 `new Function('exports', 'require', ...)`），并保证组件可以访问 `defineProps`、`h` 等 API（传入 `vue` runtime 对象、插件 SDK 等）。
- 生成的组件应该接收标准 props：`{ item: TuffItem, payload?: PreviewCardPayload }`，并通过事件与外部通信（`@copy-primary`、`@show-history`）。

### 4. 渲染器注册
- 通过新的 IPC 通道（例如 `plugin:widget:register`），将组件定义、CSS、依赖列表、唯一 `widgetId` 发送到 renderer。
- renderer 端调用类似 `registerCustomRenderer(widgetId, componentDef)`，并把 CSS 注入 `document.head`（可以用 `style` 标签 + `data-widget` 贴上 tag）。
- 调用 `setCustomRender('vue', widgetId, payload)` 构造 `TuffItem`，`CoreBoxRender` 会自动使用注册组件。

### 5. 热更新/缓存
- 为了避免每次触发都重新编译，主进程应缓存 `widgetId` → 编译结果，只有文件内容变化时才重新编译。
- 可监听 `${plugin.pluginPath}/widgets` 目录的 `fs.watch`，或在 Dev 模式下监听插件 dev server 提供的心跳（借鉴 `PluginViewLoader` 的 dev 情况）。
- 当源文件改变时，通过 `plugin:widget:update` 事件通知 renderer 重新注册新组件并刷新当前 custom render。

### 6. 安全与错误处理
- 任何编译失败或执行报错都不能阻塞 CoreBox，应该向 `TouchPlugin.issues` 推送 `widget-compile-failed` 并回退到 fallback 渲染（提示用户 widget 加载失败）。
- `renderer` 端需要在 `CoreBoxRender` 里优雅处理 `customRenderer` 为 null 的情况（目前已经有 debug fallback）。
- 所有来自插件的 widget 都运行在渲染进程的 Vue 沙箱里，不能直接访问 Node API；如需挂载 api，可通过 `pluginSDK` 提供的安全入口。

## Internal Widget 渲染与默认组件
- 对于内置 feature，继续沿用 `apps/core-app/src/renderer/src/modules/box/custom-render/registerDefaultCustomRenderers` 注册一批常用组件。
- `TouchPlugin` 在 `internal` 路径里可以直接调用 `setCustomRender('vue', 'core-intelligence-answer', payload)`，不走动态编译。
- 可以在 `internal` 插件注册阶段硬编码 `widgetId`（如 `core-widgets::intelligence-answer`），同时在 renderer 启动流程中 `registerCustomRenderer`。

## 待办

### 已完成 ✅
1. ✅ 确定 internal 和非 internal 的判定逻辑
2. ✅ 设计并实现主进程的 WidgetLoader/Compiler/Manager
3. ✅ renderer 端 custom-render 模块拓展
4. ✅ plugin:widget:* IPC 通道
5. ✅ chokidar 文件监听与热更新

### 待完成 🟡
6. [ ] Dev 模式与远程源码支持
7. [ ] 撰写使用文档

## 详细拆解
1. **Internal 判定与 default renderer 注册**
   - 制定 `isInternalPlugin(plugin: TouchPlugin)` 的判定策略（名字前缀、路径、内置列表）。
   - 在 renderer 启动阶段预注册 internal widget 组件，并提供 `registerInternalWidget(name, component)` helper。
   - Internal 插件触发 widget 时跳过编译流程，直接 `setCustomRender('vue', internalWidgetId, payload)`。
2. **主进程 widget loader 设计**
   - 新增 `WidgetLoader` 类负责：读取 `.vue` 源码、调用 `@vue/compiler-sfc` 编译、组合脚本 + render + css、缓存产物。
   - 安全检查：路径归一化、禁止 `..`、禁止越权读取 `pluginPath` 外的文件。
   - 提供 `loadWidget(plugin, feature)` API 返回 `{ widgetId, componentCode, styles }`，并记录 `plugin.name` 关联。
3. **IPC 与渲染注册**
   - 定义 `plugin:widget:register`、`plugin:widget:update`、`plugin:widget:unregister` channel。
   - 主进程在 `loadWidget` 成功后向 renderer 发送组件源码+CSS，renderer 执行 `eval` (借助 `@vue/runtime-dom`) 生成组件，并调用 `registerCustomRenderer(widgetId, component)`。
   - Renderer 维护 `style` 标签池，确保每个 widget 的样式只插入一次并带上 `data-widget-id`。
4. **动态组件缓存与更新**
   - `WidgetLoader` 利用 `fs.watch` 或 `chokidar` 监听 `widgets/` 目录的文件变动，触发重新 `loadWidget` 并 send update。
   - 每个 widget 记录 hash，只有内容变化才重新编译。
   - 在插件停用或卸载时通过 `plugin:widget:unregister` 清理 renderer 注册和样式。
5. **Feature 触发链路**
   - `PluginFeature` 或 `TouchPlugin` 在 `onFeatureTriggered` 判断 `feature.interaction?.type === 'widget'`。
   - 对 internal 调用 default renderer；非 internal 则调用 `WidgetLoader.loadWidget` + `setCustomRender('vue', widgetId, payload)`。
   - `payload` 中带上 `requestId`, `featureId`, `pluginName` 等，用于调试。
6. **Dev 模式与远程源码**
   - Device `plugin.dev.source` 情况下从 `dev.address/widgets/...` 拉取源码或预编译产物。
   - 支持 `axios` 拉取 `.vue` + `.css`，并缓存到内存。
   - 必要时支持远程 `bundle.js` + `metadata.json` 结构。
7. **错误与监控**
   - 所有 loader/IPC 错误记录到 `plugin.issues`，并通过 `touchEventBus` 广播（`plugin-widget-load-error`）。
   - Renderer 端 `CoreBoxRender` 继续保持 fallback，未注册组件时显示提示。
8. **文档与 QA**
   - 在 `apps/docs/docs/plugins/widget.md` 增补“如何编写 widget vue 源码、如何声明 interaction”章节。
   - 在 `plan-prd` 内新增“widget loader 实施计划”章节，列出验收标准。

## AI Internal Widget 流程梳理
- `apps/core-app/src/main/plugins/internal/internal-ai-plugin.ts#L1` 通过 `createInternalAiPlugin` 构造 `TouchPlugin`（路径在 `apps/core-app/src/main/plugins/internal/index.ts#L1`）并注册名为 `internal-ai-ask` 的 feature（`interaction.type === 'widget'`）。
- 触发后 `createAiLifecycle` 负责往 `CoreBox` 推送 `TuffItem`：
  1. `buildBaseItem` 创建带插件元数据的 `TuffItemBuilder`。
  2. `setCustomRender('vue', DEFAULT_WIDGET_RENDERERS.CORE_INTELLIGENCE_ANSWER, payload)` 指定 `custom.content` 为 `core-intelligence-answer`，`payload` 携带请求状态/回答等。
  3. `usePluginStore` + `CoreBoxRender` 的 `customRenderer` 通过 `getCustomRenderer` 拿到 `CoreIntelligenceAnswer` 组件（`apps/core-app/src/renderer/src/modules/box/custom-render/index.ts#L1`）。
- 内部 widget 不走动态编译，依赖 `apps/core-app/src/renderer/src/modules/box/custom-render/registerDefaultCustomRenderers()` 在渲染器启动时 `registerCustomRenderer('core-intelligence-answer', CoreIntelligenceAnswer)`，并由 `TouchPlugin` 的 item 直接渲染。
- 该流程与新 widget loader 保持一致的契约：shared const `DEFAULT_WIDGET_RENDERERS`（`packages/utils/plugin/widget.ts#L1`）让内置组件与第三方组件共享命名、`IMeta` 结构也保持一致。

## Widget Loader 运行时概览
- `WidgetLoader`（`apps/core-app/src/main/modules/plugin/widget/widget-loader.ts#L1`）负责解析 `widgets/` 目录、校验路径、读取 `.vue` 源码并缓存 `WidgetSource{ widgetId, hash, source }`。
- `WidgetCompiler`（`apps/core-app/src/main/modules/plugin/widget/widget-compiler.ts#L1`）用 `@vue/compiler-sfc`+`esbuild` 编译 `<script setup>` 和 `<template>`，产出 `code`+`styles`。
- `WidgetManager`（`apps/core-app/src/main/modules/plugin/widget/widget-manager.ts#L1`）处理三类场景：
  1. 首次调用 `registerWidget`，编译后通过 `genTouchChannel().send(... 'plugin:widget:register' ...)` 通知 renderer（`widget-registry.ts#L1`），并在 `watchers` map 中启动插件目录的 `chokidar` 监听。
  2. 监听到 `widgets/<name>.vue` 变更时 `handleWidgetFileChange` 触发 `registerWidget(... , { emitAsUpdate: true })`，通过 `plugin:widget:update` 更新组件并刷新样式。
  3. 插件停用/卸载或文件被删除时走 `handleWidgetFileRemoved` → `unregisterWidget(widgetId)`，renderer 端通过 `plugin:widget:unregister` 清理注册表和样式。
- 渲染器端的 `widget-registry.ts#L1` 通过 `new Function` 恢复组件、`registerCustomRenderer`、`injectStyles` 并在 `custom-render` 模块增加 `unregisterCustomRenderer`，保持动态组件生命周期一致。

**参考**: `apps/core-app/src/renderer/src/components/render/CoreBoxRender.vue`, `apps/core-app/src/main/modules/plugin/view/plugin-view-loader.ts`, `apps/core-app/src/renderer/src/modules/box/custom-render/index.ts`
