# AnalyticsModule (TuffTransport)

## 概览
- 主进程模块，接入 TuffTransport 事件，聚合 IPC/系统/插件指标，支持内存热数据 + SQLite 冷数据。
- 组件：AnalyticsCore（聚合）+ MemoryStore（1m/5m/15m/1h/24h 保留）+ DbStore（15m+/持久化）+ 采集器（IPC tracer、系统 sampler、插件 tracer）。
- 清理：默认每小时清理持久化窗口（15m/1h/24h）超出保留期的数据；内存按窗口自动裁剪。

## TuffTransport 事件
- analytics.get-snapshot: { windowType } → AnalyticsSnapshot
- analytics.get-range: { windowType, from, to } → AnalyticsSnapshot[]
- analytics.export: { windowType, from, to, format?, dimensions? } → { format, content, exportedAt }
- analytics.toggle-reporting: { enabled } → { enabled }
- analytics.messages.list: { status?, source?, since?, limit? } → AnalyticsMessage[]
- analytics.messages.mark: { id, status } → AnalyticsMessage | null
- analytics.sdk.*（插件/渲染进程）
  - sdk.track-event: { eventName, featureId?, metadata?, pluginName?, pluginVersion? }
  - sdk.track-duration: { operationName, durationMs, featureId?, pluginName?, pluginVersion? }
  - sdk.get-stats: { pluginName? } → PluginStats
  - sdk.get-feature-stats: { pluginName?, featureId } → FeatureStats
  - sdk.get-top-features: { pluginName?, limit? } → { id, count }[]
  - sdk.increment-counter / set-gauge / record-histogram: { name, value, pluginName?, pluginVersion? }

## 插件侧 SDK 用法
```ts
import { createPluginAnalyticsClient } from '@talex-touch/utils/analytics'

const analytics = createPluginAnalyticsClient({ pluginName: 'my-plugin' })

await analytics.trackEvent('feature_used', { foo: 'bar' }, 'feature-id')
await analytics.measure('heavy-op', async () => doSomething())
await analytics.getStats()
```

## 数据存储与保留
- 内存：1m(保留5m)/5m(1h)/15m(6h)/1h(24h)/24h(7d)。
- SQLite 表：
  - analytics_snapshots(window_type, timestamp, metrics JSON)
  - plugin_analytics(plugin_name, plugin_version, feature_id, event_type, count, metadata JSON, timestamp)
  - analytics_report_queue(endpoint, payload, created_at, retry_count, last_attempt_at, last_error)
- 持久化窗口：15m、1h、24h 自动落盘并按保留策略清理。

## 搜索性能接入
- Layered 与 Legacy 搜索完成时，汇总 providerTimings 与 totalDuration，调用 AnalyticsModule.recordSearchMetrics。
- providerTimings 格式：{ providerId/providerName: durationMs }，同步更新 search.totalSearches、avgDuration、providerTimings。

## 汇报/导出流程
1) 采集：系统采样、IPC tracer、插件 SDK（sdk.*）、搜索耗时。
2) 聚合：TimeWindowCollector 以 1m 为基扇出 5m/15m/1h/24h，MemoryStore 按窗口保留。
3) 持久化：15m/1h/24h 窗口落盘到 analytics_snapshots；定时按保留期清理。
4) 查询：TuffTransport `analytics.get-snapshot/get-range/export` 提供窗口数据。
5) SDK：插件/渲染通过 `analytics.sdk.*` 上报事件/耗时/计数/直方图等。
6) 导出：`analytics.export` 支持 json/csv，返回 { format, content, payload, exportedAt }。
7) 上报：保留 legacy `analytics.report`（StartupAnalytics），后续可插入 batch reporter 调用 Nexus。

## 兼容性
- 保留 StartupAnalytics 输出（getCurrent/getHistory/getSummary/report）供旧通道使用。
- IPC 耗时通过 channel-core 注入 tracer 统计。

## 待办/扩展
 - 模块级/插件调用/搜索慢查询等采集器补全，批量上报 Nexus，前端 Dashboard 数据接入。
