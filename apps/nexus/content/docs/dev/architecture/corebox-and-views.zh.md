# CoreBox 窗口行为与 UI View 缓存

## CoreBox 高度与窗口缩放

CoreBox 的高度由渲染进程结果列表驱动，并通过主进程应用到窗口。

- 窗口位置固定（仅高度变化）。
- 开启动画时，主进程对窗口 bounds 变化做平滑过渡。

**高度分发链路（renderer -> main）**

- 渲染侧 `useResize` 计算高度：`headerHeight + scrollHeight + padding`，并 clamp 到 `64–600`。
- 发送 `CoreBoxEvents.layout.update`，包含 `height/resultCount/loading/recommendationPending/activationCount/source`。
- 主进程合并 16ms 内的布局请求：`CoreBoxModule.queueLayoutUpdate` → `applyLayoutUpdate`。

**收缩判定与覆盖逻辑**

- `resultCount === 0 && !loading && !recommendationPending` → `shrink()`。
- `activationCount > 0 && resultCount > 0` → `expand({ forceMax: true })`。
- 其他情况：按 `height` 调整 `setHeight()`。
- UI Mode 下直接跳过布局更新（避免 UI View 附着时频繁缩放）。

**手动控制入口**

- `CoreBoxEvents.ui.expand` 支持 `collapse/max/length`。
- `core-box:set-height` 支持前端指定高度（60–650，主进程再 clamp）。

**相关设置**

- `appSetting.animation.coreBoxResize`
  - `true`: 开启 CoreBox 窗口伸缩动画
  - `false`: 直接设置 bounds

## 空输入的推荐结果

当输入为空且没有激活 provider 时，CoreBox 会向主进程请求推荐结果。

为避免推荐结果还在返回途中导致窗口“先收起再展开”，渲染进程在推荐请求期间保持 pending 状态（或短超时）。

**推荐触发与回写流程**

- 触发条件：输入为空 + 无激活 provider。
- `appSetting.recommendation.enabled === false` 时直接 `resetSearchState()` 并刷新布局。
- 推荐请求期间 `recommendationPending = true`，超时 400ms 仍无结果则重置状态。
- 主进程空查询触发 `RecommendationEngine.recommend(limit=10)`。
- 若推荐结果为空，主进程会发 `CoreBoxEvents.search.noResults({ shouldShrink: true })`，但窗口收缩仍依赖布局更新链路。

## AutoPaste / AutoClear（CoreBox 显示阶段）

**AutoPaste**

- 仅在“快捷键唤起 CoreBox”时触发。
- 新鲜度判断：`autoPaste.time`（秒），`0` 视为 5 分钟，`-1` 关闭。
- 处理流程：`handlePaste()` 同步剪贴板 → `handleAutoFill()` 自动填充。
- 文本 <= 80 字会直接填入输入框；超长文本只作为 tag；文件/图片走专用模式。
- 使用 `autoPastedTimestamps` 去重（TTL 1h），并通过 `clearClipboard(remember)` 避免重复触发。

**AutoClear**

- 仅在 CoreBox **再次显示** 时检测 `lastHidden` 与 `autoClear` 时间差。
- 超时后清空输入、模式、文件/布局、剪贴板缓存，并停用 provider。
- 不是后台定时器：窗口一直保持可见时不会触发。

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

## 常见问题排查（近期反馈）

**1) 空输入且无推荐结果时不收缩**

- 关注 `recommendationPending` 是否一直为 `true`（`applyLayoutUpdate` 会跳过收缩）。
- `search.noResults` 事件本身不会改变窗口高度，仍需 `layout.update` 才会收缩。
- 确认是否处于 UI Mode，主进程会直接跳过布局更新。
- 确认 `activeActivations` 是否非空（有激活时会强制展开）。

**2) 超过 autoPaste 时间仍自动粘贴**

- `ClipboardEvents.getLatest` 返回的 `createdAt` 来自 `item.timestamp`，若缺失会回退 `Date.now()`，会被视为“刚复制”。
- 剪贴板监测可能会重复写入同一内容并刷新 `timestamp`，导致“看似过期但仍新鲜”。
- 确认配置值是否落地：`appSetting.tools.autoPaste.time` 为秒。

**3) 激活插件后过久，autoClear 不生效**

- `autoClear` 只在 CoreBox 再次显示时检查；UI 一直保持可见不会触发。
- `lastHidden` 在 `onHide` 写入，UI Mode 长时间保持可见时不会更新。
