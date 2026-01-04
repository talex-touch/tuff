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
8) 插件版本：插件事件补充 `pluginVersion`（可选 `sdkapi`），支持版本维度筛选。
9) 地域/时区/热力图：记录用户时区、区域分布、时间段活跃度、点击热力图（聚合桶）。

## 存储与保留
- 内存保留：1m(5m) / 5m(1h) / 15m(6h) / 1h(24h) / 24h(7d)。
- 冷数据：15m/1h/24h 落盘 SQLite，定时清理按保留期。
- 插件事件：plugin_analytics 表，含 plugin_name/plugin_version/feature_id/event_type/count/metadata/timestamp。
- 上报失败归档：入库或队列化（建议本地 DB 队列），保留 14 天，过期清理。
  - analytics_report_queue(endpoint, payload, created_at, retry_count, last_attempt_at, last_error)

## 维度与筛选（App / 官网共用）
- 时间：小时/日/周/30天；对比窗口（本期 vs 上期）。
- 应用：appVersion、channel（dev/stable）、平台/架构、地区/时区（匿名聚合）。
- 插件：pluginName、pluginVersion（可选 sdkapi）、featureId、事件类型。
- 搜索：场景（quick/clipboard/file/system/plugin）、provider、耗时、命中率。
- 用户：匿名 ID（仅本地）、活跃度分层（1d/7d/30d）。

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
- 视图同步：设置页与 Analytics 面板共用数据源与刷新策略，实时一致（同一 store + 订阅刷新）。
- 插件维度：支持按版本/featureId 筛选趋势、耗时、错误率。
- 热力图：活跃时段分布、地域分布、点击热力图（聚合桶，支持切换匿名视图）。
- 搜索指标：搜索场景分布、平均搜索耗时、平均排序耗时、平均搜索字符长度、结果类型占比。
- 执行指标：执行延迟（搜索到执行）、最受欢迎插件/功能、最常执行的类型（app/file/plugin）。

## 上报与批量
- BatchReporter（待实现）：5min 或 100 条批量，调用 analytics.export，脱敏后推送 Nexus API。
- TelemetryClient（待实现）：支持重试、退避、网络不可用降级。
- 重放防护：批量记录唯一批次 ID 与时间窗口。
- 本地优先：开发环境默认走本地 Nexus（`http://localhost:3200`），线上走 `NEXUS_API_BASE`。
- 失败提示：上报失败需在设置页提示 + 消息中心记录；成功后自动清空队列。

## 官网/文档
- 官网新增页面「Analytics & Telemetry」：说明采集范围、脱敏策略、开关、保留期、导出/删除方法。
- Dev Docs：补充插件侧使用 `createPluginAnalyticsClient` 示例与事件列表。
- 官网 Dashboard：搜索场景指标、插件版本筛选、热力图可视化。
- 插件详情弹窗：新增 Analytics 入口（下载/收藏/更新/使用趋势 + 版本对比）。

## 隐私与开关
- 开关：settings -> analytics，默认启用但搜索内容脱敏；可关闭上报但保留本地指标。
- 脱敏：**不采集/不上报任何搜索词**；仅上报长度/类型/耗时/结果分布等聚合指标。
- 保留期：遵循上表；导出/上报仅包含指定时间窗口。
- 匿名模式：默认开启，仅限制“出站”敏感字段；本地面板始终展示完整指标。

## 热力图与行为采集
- 活跃热力图：按小时/工作日聚合（本地精细，出站聚合）。
- 地域/时区：时区与地区只用于统计，匿名模式下仅上报聚合桶。
- 点击热力图：按 UI 区块/功能点聚合（不上传具体坐标或内容）。
- 典型热区：搜索结果列表、插件卡片、设置入口、搜索过滤器、插件功能按钮。
- 模块耗时：统计模块加载耗时（avg/max/min/ratio），展示模块间耗时对比。

## 消息模块 PRD（草案）
### 目标
- 统一承接：Sentry 异常、上报失败、性能异常、权限拒绝等消息。
- 双端同步：App 与 Nexus 后台一致展示，支持已读/归档状态同步。

### 数据模型（本地 + 远端）
```typescript
interface AnalyticsMessage {
  id: string
  scope: 'app' | 'plugin' | 'system'
  source: 'analytics' | 'sentry' | 'update' | 'permission'
  severity: 'info' | 'warn' | 'error'
  title: string
  message: string
  meta?: Record<string, unknown>
  status: 'unread' | 'read' | 'archived'
  createdAt: number
}
```

### API 草案（Nexus）
- `POST /api/telemetry/messages`：批量上报消息（带去重指纹）。
- `GET /api/telemetry/messages?since=`：拉取新消息。
- `POST /api/telemetry/messages/:id/ack`：已读/归档回执。
- `GET /api/admin/analytics/alerts`：后台告警总览。

### App 交互
- 设置页展示消息入口 + 未读数。
- Analytics 面板展示最近异常卡片与跳转。
- 失败提示：上报失败 → toast + 写入消息中心。

### 同步与去重
- 指纹：`source + type + scope + dayBucket + pluginVersion?`。
- 同步周期：前台 30s 轮询或 WS，后台 5min 聚合。

## 消息同步与告警（App / 官网 / Sentry）
- 目标：将 Sentry/上报失败/关键异常同步到消息模块，统一展示。
- 消息来源：Sentry（error/perf）、Analytics（上报失败/异常趋势）、Update/Permission。
- 消息模型：{ id, type, severity, source, title, message, meta, status, createdAt }。
- 同步流程：本地采集 → Nexus API → 消息归档 → App/官网拉取或 WebSocket 推送。
- 权限/隐私：匿名模式下消息内容脱敏，仅保留聚合统计与错误类型。

## 迭代计划
- P1：模块/权限埋点（ModuleTracer/PermissionGuard），批量上报骨架（本地队列+重试）。
- P2：Dashboard 接入 + 慢查询/错误率展示 + 设置页同步 + 热力图基础。
- P3：官网文档 + Nexus 管理端对接（overview/performance/errors）+ 插件版本筛选。
- P4：消息模块 + Sentry 同步 + 插件详情 Analytics 入口。
