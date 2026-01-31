# Widget 渲染流程梳理

Status: Working

## 目标
- 说明插件 Widget 从源码到渲染的完整链路
- 解释“预先编译产物未被读取”的原因与位置
- 给出渲染问题的定位入口与可选改造方向

## 当前流程（现状）
1. 插件声明 Widget
   - `feature.interaction.path` 指向源码（如 `.vue`/`.tsx`）
2. 主进程加载源码
   - `WidgetLoader.loadWidget` 读取本地文件或 dev server 远端源码
3. 主进程编译
   - `compileWidgetSource` → processor（vue/tsx/script）
   - 产出 `{ code, styles, dependencies }`
   - 若命中 `<pluginTemp>/widgets/<widgetId>.cjs + .meta.json`，且源文件 mtime 未变化，则直接复用编译产物（避免读取源码）
4. 主进程注册给渲染端
   - `WidgetManager.registerWidget` 发送 `plugin:widget:register/update`
   - payload 内直接携带编译后的 `code` 与 `styles`
5. 渲染端注册组件
   - `widget-registry` 监听 `plugin:widget:*` 事件
   - `evaluateWidgetComponent(code)` 执行并得到 Vue 组件
   - `registerCustomRenderer(widgetId, component)`
6. WidgetFrame 渲染
   - `WidgetFrame` 通过 `rendererId` 获取并渲染组件
   - 默认走 light render；shadow render 作为后续扩展入口
7. 预览场景（PluginFeatures）
   - 通过 `plugin:api:register-widget` 触发主进程重新编译并注册
   - 走同一条 “编译→注册→渲染” 链路

## 预编译产物（.cjs）的读取方式
编译产物会被写入临时目录：
- `<pluginTemp>/widgets/<widgetId>.cjs`
- `<pluginTemp>/widgets/<widgetId>.meta.json`
  - meta 含 `hash/styles/dependencies/sourceMtimeMs`

当前由主进程读取并复用（hash 匹配时）：
- **主进程**：读取 `.cjs + .meta.json` 复用编译产物，基于 `sourceMtimeMs` 判断是否需要重新编译
- **渲染端**：仍只接收 IPC payload，不直接读文件

这样可以保证：
- 编译结果与当前源码哈希一致
- 避免渲染端文件访问带来的权限与安全面
- 减少无必要 I/O 与重复编译

## 渲染问题定位建议
1. 主进程日志
   - `[WidgetManager]`：是否成功 load/compile/register
   - 关注 `WIDGET_*` issue 码（路径缺失、读取失败、编译失败）
2. 渲染端日志
   - `[WidgetRegistry]`：是否收到 register/update
   - `[WidgetFrame] renderer ready/missing`：组件是否可用
3. `rendererId` 一致性
   - 需与 `makeWidgetId(plugin.name, feature.id)` 一致
4. 依赖限制
   - `WidgetProcessor` 只允许白名单依赖；未允许会导致执行失败

## 已落地支持
1. **主进程优先读取产物**  
   - `<pluginTemp>/widgets/<widgetId>.cjs + .meta.json` hash 匹配时直接复用。
2. **支持 `.cjs` 直接作为 interaction.path**  
   - 脚本处理器支持 `.cjs`，按已编译脚本处理。

---

关键文件（建议入口）：
- `apps/core-app/src/main/modules/plugin/widget/widget-loader.ts`
- `apps/core-app/src/main/modules/plugin/widget/widget-manager.ts`
- `apps/core-app/src/main/modules/plugin/widget/widget-compiler.ts`
- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`
- `apps/core-app/src/renderer/src/components/render/WidgetFrame.vue`
