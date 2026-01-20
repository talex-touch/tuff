# CoreBox 窗口行为与 UI View 缓存

## CoreBox 高度与窗口缩放

CoreBox 的高度由渲染进程结果列表驱动，并通过主进程应用到窗口。

- 窗口位置固定（仅高度变化）。
- 开启动画时，主进程对窗口 bounds 变化做平滑过渡。

**相关设置**

- `appSetting.animation.coreBoxResize`
  - `true`: 开启 CoreBox 窗口伸缩动画
  - `false`: 直接设置 bounds

## 空输入的推荐结果

当输入为空且没有激活 provider 时，CoreBox 会向主进程请求推荐结果。

为避免推荐结果还在返回途中导致窗口“先收起再展开”，渲染进程在推荐请求期间保持 pending 状态（或短超时）。

## 插件 `attachUIView` 缓存

对于 `webcontent` 类型 feature，CoreBox 通过 Electron `WebContentsView` attach 插件 UI。

**目标**

复用最近使用的 view，减少重复 load 带来的白屏与启动开销。

**缓存配置**

- `appSetting.viewCache.maxCachedViews`
  - `0`: 禁用（每次都重新创建/销毁）
  - `> 0`: 启用 LRU 缓存

- `appSetting.viewCache.hotCacheDurationMs`
  - 用于 stale cleanup。

**说明**

- 缓存 key: `pluginName:featureId`。
- 缓存是 best-effort：如果 view 被销毁会自动从缓存移除。

**Resume 事件**

每次 CoreBox attach 插件 UI view 时，都会向插件进程发送 `core-box:ui-resume` 事件，插件可以自行决定是否处理（例如刷新数据、恢复焦点等）。

Payload:

- `source`: `attach` | `cache`
- `featureId`: 可选
- `url`: attach 的 URL
