# Analytics 数据与埋点 PRD（主进程 / 渲染 / 插件 / 官网）

## 目标
- 统一采集路径：IPC、搜索、模块生命周期、插件调用、系统资源。
- 统一事件通道：TuffTransport（analytics.*，analytics.sdk.*）。
- 统一存储：MemoryStore 热数据 + SQLite 冷数据（analytics_snapshots / plugin_analytics）。
- 对外能力：快照/区间/导出/上报接口；前端 Dashboard；官网文档。
- 合规：脱敏、开关控制、保留期、最小化。

## 采集面
1) IPC：channel-core 已接入耗时/成功率。
2) 系统资源：SystemSampler 周期采样 CPU/内存/堆。
3) 搜索：fast/deferred/legacy 搜索完成时汇总 providerTimings + totalDuration。
4) 插件：analytics.sdk.*（事件/耗时/计数/直方图/Top features）；plugin_analytics 表落盘。
5) 模块：待接入 ModuleTracer（生命周期耗时、错误率、慢调用 >100ms）。
6) 权限/安全：在 PermissionModule/PermissionGuard 中埋点通过/拒绝/超时。
7) 其他：终端/下载等可按需补充耗时与错误率。

## 存储与保留
- 内存保留：1m(5m) / 5m(1h) / 15m(6h) / 1h(24h) / 24h(7d)。
- 冷数据：15m/1h/24h 落盘 SQLite，定时清理按保留期。
- 插件事件：plugin_analytics 表，含 plugin_name/feature_id/event_type/count/metadata/timestamp。

## 接口（TuffTransport）
- analytics.get-snapshot({ windowType })
- analytics.get-range({ windowType, from, to })
- analytics.export({ windowType, from, to, format?, dimensions? })
- analytics.toggle-reporting({ enabled })
- analytics.sdk.*：track-event / track-duration / get-stats / get-feature-stats / get-top-features / increment-counter / set-gauge / record-histogram
- 兼容：get-current/get-history/get-summary/report（StartupAnalytics）

## Dashboard（前端）
- 面板：Overview（各窗口卡片）、Real-time（CPU/内存/IPC/搜索）、Modules、Plugins、Search（providerTimings/慢查询）、History（对比）、Reports（导出）。
- 数据源：上述 TuffTransport 事件；搜索 providerTimings 显示排名/慢查询列表。
- 开关：刷新频率/上报开关/脱敏开关（默认脱敏搜索内容）。

## 上报与批量
- BatchReporter（待实现）：5min 或 100 条批量，调用 analytics.export，脱敏后推送 Nexus API。
- TelemetryClient（待实现）：支持重试、退避、网络不可用降级。
- 重放防护：批量记录唯一批次 ID 与时间窗口。

## 官网/文档
- 官网新增页面「Analytics & Telemetry」：说明采集范围、脱敏策略、开关、保留期、导出/删除方法。
- Dev Docs：补充插件侧使用 `createPluginAnalyticsClient` 示例与事件列表。

## 隐私与开关
- 开关：settings -> analytics，默认启用但搜索内容脱敏；可关闭上报但保留本地指标。
- 脱敏：搜索 query、文件路径等敏感字段不出站；仅汇总 providerTimings/耗时。
- 保留期：遵循上表；导出/上报仅包含指定时间窗口。

## 迭代计划
- P1：模块/权限埋点（ModuleTracer/PermissionGuard），批量上报骨架（本地队列+重试）。
- P2：Dashboard 接入 + 慢查询/错误率展示 + 前端设置项。
- P3：官网文档 + Nexus 管理端对接（overview/performance/errors）。
