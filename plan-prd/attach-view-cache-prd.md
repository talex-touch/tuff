# PRD: AttachUIView 缓存与自适应预加载策略 (v1.0)

## 1. 背景与目标

- **频繁加载开销大**: AttachUIView 每次打开都重新创建 WebContents，导致白屏时间长、资源浪费。
- **热门视图场景**: 常用插件视图（AI 聊天、翻译、任务）需要秒开体验，需引入智能预加载。
- **系统资源有限**: 需要在性能与体验之间取得平衡，通过使用频率决策缓存策略。

## 2. 用户价值与场景

- **高频 AI 会话**: 用户频繁唤起 AI 助手视图，希望秒开且保留上下文。
- **工具链联动**: 翻译 → 语法检查 → 写作插件连贯触发，需要减少重复加载。
- **专注模式**: 用户在写作流程中切换多个视图，缓存避免内容丢失。

## 3. 功能需求

### 3.1 缓存层级

- **热缓存 (Hot Cache)**: 最近 2 分钟内使用过的视图直接保留 WebContents，与会话上下文。
- **暖缓存 (Warm Cache)**: 最近 30 分钟内多次使用的视图保留加载状态，但暂停脚本执行。
- **冷状态**: 其他视图按需销毁，仅保留配置与最近摘要。

### 3.2 频率判定与得分模型

- 基于 `使用次数`、`最近一次使用时间`、`平均会话时长` 计算 `ViewScore`。
- 支持插件声明 `preloadHint`（`always`, `adaptive`, `never`）。
- 当 `ViewScore >= 0.7` 时自动预加载；低于 0.3 时仅按需加载。

### 3.3 预加载与回收策略

- 支持在系统空闲时段（CPU < 20%，内存空闲 > 30%）触发预加载任务。
- 设定最大缓存数量（默认 4 个 WebContents），超出时使用 LRU 方案释放。
- 允许用户在设置里查看/清理缓存。

### 3.4 插件 API 支撑

- SDK 暴露 `plugin.uiView.requestPreload()`、`plugin.uiView.setCachePolicy(policy)`。
- `policy` 支持 `hot-only`, `warm`, `cold` 三类，插件可按场景调整。
- 提供 `onEvicted` 回调，插件可在被回收前保存必要状态。

## 4. 非功能需求

- **性能**: 预加载任务不得引起帧率下降超过 5 FPS；缓存命中率目标 ≥ 70%。
- **资源**: 单个缓存视图内存占用需小于 200MB；总占用超过阈值主动回收。
- **可观测性**: 提供缓存命中率、预加载耗时、回收次数等指标上报。

## 5. 技术方案概述

### 5.1 Score 计算服务

- 后端维护 `ViewUsageStore` (SQLite)，字段包含 `viewId`, `pluginId`, `usageCount`, `lastUsedAt`, `avgDuration`。
- 每次视图激活/关闭时写入使用记录，按分钟聚合。
- 后台定时任务计算 `ViewScore = sigmoid(usageCountWeight + recencyWeight + durationWeight)`。

### 5.2 缓存管理器

- 实现 `AttachViewCacheManager`，管理多级缓存队列。
- 监听系统资源指标（memory pressure、GPU usage），根据阈值执行降级。
- 与 DivisionBox/多视图共存逻辑兼容，避免重复加载。

### 5.3 预加载调度

- 新建 `PreloadScheduler`，在系统空闲时通过 `setTimeout` + `performance.now()` 控制调度。
- 支持手动触发预加载（如用户固定的常用视图）。

## 6. 伪代码示例

```ts
// Score 计算
function computeViewScore(stats: ViewStats): number {
  const recency = Math.exp(-(now - stats.lastUsedAt) / RECENCY_HALF_LIFE)
  const frequency = Math.log(1 + stats.usageCount)
  const duration = clamp(stats.avgDuration / TARGET_DURATION, 0, 1)
  const raw = 0.5 * recency + 0.3 * frequency + 0.2 * duration
  return 1 / (1 + Math.exp(-3 * (raw - 0.5)))
}
```

## 7. 实施计划

1. **[ ] 使用数据采集**: 打通视图使用埋点，建立 `ViewUsageStore`。
2. **[ ] Score 模型实现**: 建立定时任务计算 `ViewScore` 并可视化指标。
3. **[ ] 缓存管理器**: 完成 Hot/Warm/Cool 阶段的缓存与回收机制。
4. **[ ] SDK 接口**: 提供 `requestPreload`、`setCachePolicy`、`onEvicted`。
5. **[ ] 系统设置&调试工具**: 可视化缓存状态，支持手动清理。
6. **[ ] 性能/压力测试**: 核验预加载对性能影响与回收策略有效性。

## 8. 风险与待决问题

- **资源竞争**: 高配机器与低配机器策略需区分，是否引入硬件画像？
- **数据准确性**: 使用统计需防止因异常关闭导致数据偏差。
- **插件行为差异**: 部分插件在被暂停脚本后可能丢失状态，需要提供兼容模式。

## 9. 验收标准

- 缓存命中率≥70%，平均打开时延下降 ≥ 40%。
- 系统资源监控下，预加载不会导致显著卡顿或崩溃。
- 插件能够感知缓存事件并正确保存/恢复状态。

## 10. 成功指标

- 高频视图打开耗时中位数 < 200ms。
- 预加载任务失败率 < 2%。
- 用户反馈中关于“白屏等待”的问题减少 50%。

## 11. 后续迭代方向

- 引入机器学习模型动态调整权重，适配不同用户习惯。
- 打通云端，同步常用视图画像到多设备。
- 支持插件上报自定义指标（如推理耗时）参与评分。
