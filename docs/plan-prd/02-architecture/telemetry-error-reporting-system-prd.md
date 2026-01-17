# Telemetry & Error Reporting System PRD

## 文档概述

| 项目 | 内容 |
|-----|------|
| 版本 | v1.0.0 |
| 创建日期 | 2024-12-09 |
| 优先级 | P0 |
| 预期交付 | 2025-Q1 |

---

## 1. 背景与问题分析

### 1.1 当前问题

从日志截图分析，存在以下核心问题：

**1. SearchGatherer Provider 超时**
```
[ERROR] [SearchGatherer] Provider [url-provider] failed:
TimeoutError: Promise timed out after 3000 ms
```

**2. AppScanner 性能问题**
- 大量 `Info.plist not found` 警告
- macOS `mdfind` 命令返回无效应用路径
- 无法区分真正的错误 vs 预期的警告

**3. 缺乏结构化错误收集**
- 错误仅打印到控制台
- 无法追踪错误频率、影响范围
- 无法关联用户行为与错误

### 1.2 参考标准（主流大厂实践）

| 厂商 | 方案 | 特点 |
|-----|------|------|
| **Apple** | MetricKit + OSLog | 设备指纹 + 隐私合规 + 本地聚合 |
| **Google** | Firebase Crashlytics | 用户分群 + 热更降级 + 实时告警 |
| **Microsoft** | App Center | 设备属性 + 会话追踪 + 自定义事件 |
| **Raycast** | PostHog + Sentry | 匿名模式 + 主动上报 + 用户可控 |
| **Figma** | 自建 + DataDog | 性能指标 + 错误链路 + 特征标记 |
| **Notion** | 自建 + Segment | 事件流 + 用户画像 + A/B测试集成 |

---

## 2. 系统设计目标

### 2.1 核心目标

1. **错误追踪**：自动捕获、分类、上报所有未处理异常
2. **性能监控**：追踪关键路径耗时（搜索、插件加载、窗口渲染）
3. **用户分析**：匿名用户行为分析，支持产品决策
4. **隐私合规**：用户可控、GDPR/CCPA 合规、最小数据原则

### 2.2 设计原则

- **Privacy First**：默认匿名，用户主动选择分享
- **Offline First**：断网时本地缓存，恢复后批量上报
- **Minimal Footprint**：不影响主进程性能
- **Dual Channel**：Sentry (实时告警) + Nexus (聚合分析)

---

## 3. 数据模型设计

### 3.1 设备指纹 (Device Fingerprint)

```typescript
interface DeviceFingerprint {
  // 核心标识（SHA-256 哈希，不可逆）
  fingerprint: string
  
  // 生成因子（不直接上报）
  components: {
    platform: 'darwin' | 'win32' | 'linux'
    arch: 'x64' | 'arm64' | 'arm'
    hostname: string       // 取 SHA-256(hostname)
    cpuModel: string       // 取 SHA-256(cpuModel)
    totalMemory: number    // 取内存区间 (0-8GB, 8-16GB, 16-32GB, 32GB+)
    osVersion: string      // 取主版本号 (macOS 14, Windows 11)
    gpuRenderer?: string   // 可选，取 SHA-256
  }
  
  // 稳定性
  createdAt: number
  lastSeenAt: number
  sessionCount: number
}
```

**生成算法**：
```typescript
function generateFingerprint(components: FingerprintComponents): string {
  const raw = [
    components.platform,
    components.arch,
    sha256(components.hostname),
    sha256(components.cpuModel),
    getMemoryBucket(components.totalMemory),
    getMajorOsVersion(components.osVersion),
  ].join('|')
  
  return sha256(raw).substring(0, 32) // 32 字符足够唯一
}
```

### 3.2 用户标识体系

```typescript
interface UserIdentity {
  // Layer 1: 匿名设备
  deviceFingerprint: string
  
  // Layer 2: 登录用户（可选）
  userId?: string           // Clerk User ID
  
  // Layer 3: 付费订阅（可选）
  subscriptionTier?: 'free' | 'pro' | 'team' | 'enterprise'
  
  // 隐私设置
  privacyMode: 'anonymous' | 'pseudonymous' | 'identified'
}

// 隐私模式定义
type PrivacyMode = 
  | 'anonymous'      // 仅发送错误，无任何标识
  | 'pseudonymous'   // 发送设备指纹，不关联账号
  | 'identified'     // 完整关联（需用户授权）
```

### 3.3 错误事件模型

```typescript
interface TelemetryErrorEvent {
  // 事件标识
  eventId: string           // UUID v4
  eventType: 'error' | 'warning' | 'performance' | 'crash'
  timestamp: number         // Unix ms
  
  // 错误信息
  error: {
    name: string            // Error.name
    message: string         // Error.message (脱敏)
    stack?: string          // 堆栈 (source-mapped)
    code?: string           // 错误码 (ERR_TIMEOUT, ERR_NETWORK...)
    category: ErrorCategory
    severity: 'low' | 'medium' | 'high' | 'critical'
  }
  
  // 上下文
  context: {
    module: string          // 模块名 (SearchEngineCore, PluginManager...)
    action: string          // 操作名 (search, execute, load...)
    sessionId: string       // 会话 ID
    breadcrumbs: Breadcrumb[] // 最近 20 条操作轨迹
  }
  
  // 环境信息
  environment: EnvironmentContext
  
  // 用户（根据隐私设置）
  user?: {
    fingerprint?: string
    userId?: string
  }
  
  // 自定义属性
  tags: Record<string, string>
  extra: Record<string, unknown>
}

type ErrorCategory = 
  | 'uncaught_exception'
  | 'unhandled_rejection'
  | 'timeout'
  | 'network'
  | 'plugin'
  | 'search'
  | 'database'
  | 'storage'
  | 'render'
  | 'ipc'
  | 'system'
```

### 3.4 性能指标模型

```typescript
interface PerformanceMetrics {
  // 搜索性能
  search: {
    sessionId: string
    queryText: string       // 截断到 100 字符
    queryHash: string       // SHA-256(queryText) 用于去重
    inputTypes: TuffInputType[]
    
    // 时序
    totalDuration: number   // 总耗时 ms
    firstResultAt: number   // 首结果时间 ms
    
    // Provider 明细
    providers: Array<{
      id: string
      name: string
      duration: number
      resultCount: number
      status: 'success' | 'timeout' | 'error'
      errorCode?: string
    }>
    
    // 结果统计
    totalResults: number
    sortingDuration: number
    
    // 用户交互
    selectedItemId?: string
    selectedAt?: number
    dwellTime?: number      // 停留时间 ms
  }
  
  // 启动性能
  startup: {
    coldStart: boolean
    totalDuration: number
    phases: {
      appReady: number
      modulesLoaded: number
      windowShown: number
      coreBoxReady: number
    }
    moduleTimings: Record<string, number>
  }
  
  // 插件性能
  plugin: {
    pluginId: string
    pluginName: string
    operation: 'load' | 'unload' | 'execute' | 'render'
    duration: number
    memoryDelta?: number
    status: 'success' | 'error'
  }
}
```

### 3.5 用户行为事件

```typescript
interface BehaviorEvent {
  eventName: string
  eventCategory: 'core' | 'plugin' | 'settings' | 'navigation'
  timestamp: number
  
  // 常用事件类型
  properties: {
    // CoreBox 事件
    corebox_opened?: { trigger: 'hotkey' | 'tray' | 'api' }
    corebox_closed?: { reason: 'escape' | 'blur' | 'select' }
    search_started?: { queryLength: number, hasClipboard: boolean }
    item_selected?: { providerId: string, position: number, dwellTime: number }
    
    // 插件事件
    plugin_installed?: { pluginId: string, source: 'market' | 'local' }
    plugin_activated?: { pluginId: string, featureId: string }
    
    // 设置事件
    settings_changed?: { key: string, oldValue?: unknown, newValue: unknown }
    
    // 自定义
    [key: string]: unknown
  }
  
  // 会话信息
  sessionId: string
  sessionDuration: number
}
```

---

## 4. 架构设计

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Tuff Desktop App                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │   Modules   │  │  Renderer   │  │   Plugins   │  │  Preload   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │
│         │                │                │                │        │
│         └────────────────┴────────────────┴────────────────┘        │
│                                   │                                  │
│                    ┌──────────────▼──────────────┐                  │
│                    │    TelemetryService (Main)   │                  │
│                    │  ┌───────────────────────┐  │                  │
│                    │  │   Event Collector     │  │                  │
│                    │  │   Privacy Filter      │  │                  │
│                    │  │   Offline Queue       │  │                  │
│                    │  │   Batch Sender        │  │                  │
│                    │  └───────────────────────┘  │                  │
│                    └──────────────┬──────────────┘                  │
└───────────────────────────────────┼─────────────────────────────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │                              │
              ┌──────▼──────┐              ┌───────▼───────┐
              │   Sentry    │              │  Nexus API    │
              │  (Errors)   │              │ (Analytics)   │
              └─────────────┘              └───────────────┘
```

### 4.2 模块分层

```typescript
// src/main/modules/telemetry/
├── index.ts                    // 模块导出
├── module.ts                   // TelemetryModule (BaseModule)
├── telemetry-service.ts        // 核心服务
├── collectors/
│   ├── error-collector.ts      // 错误收集器
│   ├── performance-collector.ts // 性能收集器
│   └── behavior-collector.ts   // 行为收集器
├── processors/
│   ├── privacy-filter.ts       // 隐私过滤器
│   ├── data-enricher.ts        // 数据增强器
│   └── rate-limiter.ts         // 速率限制器
├── transporters/
│   ├── sentry-transport.ts     // Sentry 传输层
│   ├── nexus-transport.ts      // Nexus API 传输层
│   └── offline-queue.ts        // 离线队列
├── identity/
│   ├── fingerprint.ts          // 设备指纹生成
│   ├── session.ts              // 会话管理
│   └── consent.ts              // 用户授权管理
└── types.ts                    // 类型定义
```

### 4.3 数据流

```
[Error/Event 发生]
        │
        ▼
[Collector 收集] ─── breadcrumb buffer ───▶ [Context]
        │
        ▼
[Privacy Filter] ─── check consent ───▶ [Drop/Anonymize/Keep]
        │
        ▼
[Rate Limiter] ─── check quotas ───▶ [Throttle/Allow]
        │
        ▼
[Data Enricher] ─── add context ───▶ [Environment, Session, User]
        │
        ▼
[Offline Queue] ─── persistent storage ───▶ [SQLite]
        │
        ▼
[Batch Sender] ─── network available ───▶ [Transport]
        │
    ┌───┴───┐
    │       │
    ▼       ▼
[Sentry] [Nexus]
```

---

## 5. 核心功能设计

### 5.1 错误收集器 (ErrorCollector)

```typescript
class ErrorCollector {
  private breadcrumbs: CircularBuffer<Breadcrumb>
  private errorDeduper: LRUCache<string, number>
  
  /**
   * 注册全局错误处理器
   */
  register(): void {
    // Uncaught exceptions
    process.on('uncaughtException', (error, origin) => {
      this.captureError(error, {
        category: 'uncaught_exception',
        severity: 'critical',
        extra: { origin }
      })
    })
    
    // Unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.captureError(
        reason instanceof Error ? reason : new Error(String(reason)),
        {
          category: 'unhandled_rejection',
          severity: 'high',
        }
      )
    })
    
    // Electron specific
    app.on('render-process-gone', (event, webContents, details) => {
      this.captureError(new Error(`Renderer crashed: ${details.reason}`), {
        category: 'crash',
        severity: 'critical',
        extra: { details }
      })
    })
  }
  
  /**
   * 手动捕获错误
   */
  captureError(
    error: Error,
    options: CaptureOptions = {}
  ): string {
    const eventId = uuid()
    
    // 去重检查
    const errorKey = this.getErrorKey(error)
    const lastSeen = this.errorDeduper.get(errorKey)
    if (lastSeen && Date.now() - lastSeen < 60000) {
      // 1分钟内重复错误，跳过
      return eventId
    }
    this.errorDeduper.set(errorKey, Date.now())
    
    // 构建事件
    const event: TelemetryErrorEvent = {
      eventId,
      eventType: options.eventType || 'error',
      timestamp: Date.now(),
      error: {
        name: error.name,
        message: this.sanitizeMessage(error.message),
        stack: this.processStack(error.stack),
        category: options.category || 'uncaught_exception',
        severity: options.severity || 'medium',
      },
      context: {
        module: options.module || 'unknown',
        action: options.action || 'unknown',
        sessionId: sessionManager.getCurrentSessionId(),
        breadcrumbs: this.breadcrumbs.toArray(),
      },
      environment: getEnvironmentContext(),
      tags: options.tags || {},
      extra: options.extra || {},
    }
    
    // 发送到 TelemetryService
    telemetryService.send(event)
    
    return eventId
  }
  
  /**
   * 添加面包屑
   */
  addBreadcrumb(breadcrumb: Breadcrumb): void {
    this.breadcrumbs.push({
      ...breadcrumb,
      timestamp: Date.now(),
    })
  }
  
  private sanitizeMessage(message: string): string {
    // 移除敏感信息
    return message
      .replace(/\/Users\/[^/]+/g, '/Users/[REDACTED]')
      .replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\[REDACTED]')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
      .replace(/Bearer\s+[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*/g, 'Bearer [TOKEN]')
  }
}
```

### 5.2 性能收集器 (PerformanceCollector)

```typescript
class PerformanceCollector {
  private searchMetrics: SearchMetrics[] = []
  private startupMetrics: StartupMetrics | null = null
  
  /**
   * 记录搜索性能
   */
  recordSearch(metrics: SearchMetrics): void {
    // 添加用户交互追踪
    const enrichedMetrics = {
      ...metrics,
      timestamp: Date.now(),
      sessionId: sessionManager.getCurrentSessionId(),
    }
    
    this.searchMetrics.push(enrichedMetrics)
    
    // 检查是否需要发送批次
    if (this.searchMetrics.length >= 20) {
      this.flushSearchMetrics()
    }
    
    // 检查慢查询
    if (metrics.totalDuration > 1000) {
      this.reportSlowSearch(enrichedMetrics)
    }
    
    // 检查 Provider 超时
    for (const provider of metrics.providers) {
      if (provider.status === 'timeout') {
        errorCollector.captureError(
          new Error(`Provider timeout: ${provider.id}`),
          {
            category: 'timeout',
            severity: 'medium',
            module: 'SearchEngineCore',
            action: 'search',
            extra: {
              providerId: provider.id,
              providerName: provider.name,
              duration: provider.duration,
              queryLength: metrics.queryText.length,
            }
          }
        )
      }
    }
  }
  
  /**
   * 记录启动性能
   */
  recordStartup(metrics: StartupMetrics): void {
    this.startupMetrics = metrics
    
    telemetryService.send({
      eventType: 'performance',
      category: 'startup',
      data: {
        coldStart: metrics.coldStart,
        totalDuration: metrics.totalDuration,
        phases: metrics.phases,
        slowModules: this.getSlowModules(metrics.moduleTimings),
      }
    })
  }
  
  private getSlowModules(timings: Record<string, number>): string[] {
    return Object.entries(timings)
      .filter(([, duration]) => duration > 500)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name]) => name)
  }
}
```

### 5.3 隐私过滤器 (PrivacyFilter)

```typescript
class PrivacyFilter {
  private config: PrivacyConfig
  
  /**
   * 根据隐私设置过滤事件
   */
  filter(event: TelemetryEvent): TelemetryEvent | null {
    // 检查总开关
    if (!this.config.enabled) {
      return null
    }
    
    // 检查事件类型
    if (!this.isEventTypeAllowed(event.eventType)) {
      return null
    }
    
    // 根据隐私模式处理用户标识
    const filteredEvent = { ...event }
    
    switch (this.config.privacyMode) {
      case 'anonymous':
        // 完全匿名：移除所有标识
        delete filteredEvent.user
        delete filteredEvent.sessionId
        filteredEvent.fingerprint = undefined
        break
        
      case 'pseudonymous':
        // 假名模式：保留设备指纹，移除用户 ID
        filteredEvent.user = {
          fingerprint: this.config.deviceFingerprint,
        }
        delete filteredEvent.user?.userId
        break
        
      case 'identified':
        // 完整模式：保留所有标识
        // 无需处理
        break
    }
    
    // 过滤敏感字段
    return this.sanitizeEvent(filteredEvent)
  }
  
  private sanitizeEvent(event: TelemetryEvent): TelemetryEvent {
    const sensitive = ['password', 'token', 'secret', 'key', 'apiKey', 'auth']
    
    const sanitize = (obj: Record<string, unknown>): Record<string, unknown> => {
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(obj)) {
        if (sensitive.some(s => key.toLowerCase().includes(s))) {
          result[key] = '[REDACTED]'
        } else if (typeof value === 'object' && value !== null) {
          result[key] = sanitize(value as Record<string, unknown>)
        } else {
          result[key] = value
        }
      }
      return result
    }
    
    return sanitize(event) as TelemetryEvent
  }
}
```

### 5.4 离线队列 (OfflineQueue)

```typescript
class OfflineQueue {
  private db: Database
  private maxSize = 1000
  private retryAttempts = 3
  
  async init(): Promise<void> {
    // 使用 SQLite 持久化
    this.db = await this.openDatabase()
    await this.createTable()
    await this.pruneOldEvents()
  }
  
  /**
   * 入队事件
   */
  async enqueue(event: TelemetryEvent): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO telemetry_queue (id, event_type, payload, created_at, attempts)
      VALUES (?, ?, ?, ?, 0)
    `)
    
    stmt.run(
      event.eventId,
      event.eventType,
      JSON.stringify(event),
      Date.now()
    )
    
    // 检查队列大小
    if (await this.getQueueSize() > this.maxSize) {
      await this.pruneOldest(100)
    }
  }
  
  /**
   * 获取待发送批次
   */
  async getBatch(limit = 50): Promise<QueuedEvent[]> {
    const rows = this.db.prepare(`
      SELECT * FROM telemetry_queue
      WHERE attempts < ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(this.retryAttempts, limit)
    
    return rows.map(row => ({
      id: row.id,
      event: JSON.parse(row.payload),
      attempts: row.attempts,
    }))
  }
  
  /**
   * 标记事件已发送
   */
  async markSent(ids: string[]): Promise<void> {
    const placeholders = ids.map(() => '?').join(',')
    this.db.prepare(`
      DELETE FROM telemetry_queue WHERE id IN (${placeholders})
    `).run(...ids)
  }
  
  /**
   * 标记重试
   */
  async markRetry(ids: string[]): Promise<void> {
    const placeholders = ids.map(() => '?').join(',')
    this.db.prepare(`
      UPDATE telemetry_queue
      SET attempts = attempts + 1
      WHERE id IN (${placeholders})
    `).run(...ids)
  }
}
```

### 5.5 Nexus 传输层 (NexusTransport)

```typescript
class NexusTransport {
  private baseUrl: string
  private apiKey: string
  private batchSize = 50
  private flushInterval = 30000 // 30s
  
  constructor(config: NexusConfig) {
    this.baseUrl = config.baseUrl || 'https://nexus.talextouch.com'
    this.apiKey = config.apiKey
  }
  
  /**
   * 发送事件批次到 Nexus
   */
  async sendBatch(events: TelemetryEvent[]): Promise<SendResult> {
    const payload = {
      clientVersion: getAppVersionSafe(),
      clientPlatform: process.platform,
      batchId: uuid(),
      timestamp: Date.now(),
      events: events.map(e => this.transformForNexus(e)),
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/api/telemetry/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-Client-Fingerprint': identityManager.getFingerprint(),
        },
        body: JSON.stringify(payload),
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`)
      }
      
      return { success: true, count: events.length }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        retryable: this.isRetryable(error),
      }
    }
  }
  
  private transformForNexus(event: TelemetryEvent): NexusEvent {
    return {
      id: event.eventId,
      type: event.eventType,
      timestamp: event.timestamp,
      
      // 聚合友好的维度
      dimensions: {
        platform: event.environment.platform,
        arch: event.environment.arch,
        version: event.environment.version,
        channel: event.environment.channel,
        module: event.context?.module,
        action: event.context?.action,
        errorCategory: event.error?.category,
        errorSeverity: event.error?.severity,
      },
      
      // 度量值
      metrics: {
        duration: event.performance?.duration,
        resultCount: event.performance?.resultCount,
        errorCount: event.error ? 1 : 0,
        eventLoopLagMs: event.performance?.eventLoopLagMs,
        ipcSlowCount: event.performance?.ipcSlowCount,
        ipcSlowMaxMs: event.performance?.ipcSlowMaxMs,
      },
      
      // 完整载荷（用于详细分析）
      payload: event,
    }
  }
}
```

---

## 6. Nexus 服务端 API 设计

### 6.1 API 端点

```typescript
// server/api/telemetry/ingest.post.ts
export default defineEventHandler(async (event) => {
  // 验证 API Key
  const apiKey = getHeader(event, 'x-api-key')
  if (!validateApiKey(apiKey)) {
    throw createError({ statusCode: 401, message: 'Invalid API key' })
  }
  
  // 获取客户端指纹
  const fingerprint = getHeader(event, 'x-client-fingerprint')
  
  // 解析请求体
  const body = await readBody(event)
  
  // 入库
  await db.transaction(async (tx) => {
    // 更新设备记录
    await tx.insert(devices).values({
      fingerprint,
      lastSeenAt: new Date(),
      platform: body.clientPlatform,
      version: body.clientVersion,
    }).onConflictDoUpdate({
      target: devices.fingerprint,
      set: {
        lastSeenAt: new Date(),
        version: body.clientVersion,
        sessionCount: sql`${devices.sessionCount} + 1`,
      }
    })
    
    // 批量插入事件
    for (const event of body.events) {
      await tx.insert(telemetryEvents).values({
        id: event.id,
        deviceFingerprint: fingerprint,
        eventType: event.type,
        timestamp: new Date(event.timestamp),
        dimensions: event.dimensions,
        metrics: event.metrics,
        payload: event.payload,
      })
    }
  })
  
  return { success: true, received: body.events.length }
})
```

### 6.2 数据库 Schema

```typescript
// server/database/schema/telemetry.ts
import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core'

export const devices = sqliteTable('telemetry_devices', {
  fingerprint: text('fingerprint').primaryKey(),
  platform: text('platform').notNull(),
  arch: text('arch'),
  version: text('version'),
  channel: text('channel'),
  firstSeenAt: integer('first_seen_at', { mode: 'timestamp' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull(),
  sessionCount: integer('session_count').default(1),
  userId: text('user_id'), // 可选关联
})

export const telemetryEvents = sqliteTable('telemetry_events', {
  id: text('id').primaryKey(),
  deviceFingerprint: text('device_fingerprint').references(() => devices.fingerprint),
  eventType: text('event_type').notNull(), // error, performance, behavior
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  
  // 维度（用于聚合查询）
  platform: text('platform'),
  version: text('version'),
  module: text('module'),
  action: text('action'),
  errorCategory: text('error_category'),
  errorSeverity: text('error_severity'),
  
  // 度量
  duration: real('duration'),
  resultCount: integer('result_count'),
  
  // 完整载荷
  payload: text('payload', { mode: 'json' }),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// 索引
export const telemetryEventsIdx = {
  byType: index('idx_events_type').on(telemetryEvents.eventType),
  byTimestamp: index('idx_events_timestamp').on(telemetryEvents.timestamp),
  byDevice: index('idx_events_device').on(telemetryEvents.deviceFingerprint),
  byError: index('idx_events_error').on(telemetryEvents.errorCategory, telemetryEvents.errorSeverity),
}
```

### 6.3 聚合查询 API

```typescript
// server/api/telemetry/stats.get.ts
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { from, to, groupBy } = query
  
  // 错误统计
  const errorStats = await db
    .select({
      category: telemetryEvents.errorCategory,
      severity: telemetryEvents.errorSeverity,
      count: count(),
      uniqueDevices: countDistinct(telemetryEvents.deviceFingerprint),
    })
    .from(telemetryEvents)
    .where(and(
      eq(telemetryEvents.eventType, 'error'),
      gte(telemetryEvents.timestamp, new Date(from)),
      lte(telemetryEvents.timestamp, new Date(to)),
    ))
    .groupBy(telemetryEvents.errorCategory, telemetryEvents.errorSeverity)
  
  // 性能统计
  const perfStats = await db
    .select({
      module: telemetryEvents.module,
      action: telemetryEvents.action,
      avgDuration: avg(telemetryEvents.duration),
      p95Duration: sql`percentile(${telemetryEvents.duration}, 0.95)`,
      count: count(),
    })
    .from(telemetryEvents)
    .where(and(
      eq(telemetryEvents.eventType, 'performance'),
      gte(telemetryEvents.timestamp, new Date(from)),
      lte(telemetryEvents.timestamp, new Date(to)),
    ))
    .groupBy(telemetryEvents.module, telemetryEvents.action)
  
  // 设备统计
  const deviceStats = await db
    .select({
      platform: devices.platform,
      version: devices.version,
      activeDevices: count(),
      totalSessions: sum(devices.sessionCount),
    })
    .from(devices)
    .where(gte(devices.lastSeenAt, new Date(from)))
    .groupBy(devices.platform, devices.version)
  
  return { errorStats, perfStats, deviceStats }
})
```

---

## 7. UI 设计

### 7.1 设置页面

```vue
<!-- SettingTelemetry.vue -->
<template>
  <div class="telemetry-settings">
    <h2>数据收集与隐私</h2>
    
    <div class="setting-section">
      <h3>遥测数据</h3>
      <p class="description">
        帮助我们改进 Tuff，发送匿名使用数据和崩溃报告。
      </p>
      
      <div class="toggle-item">
        <el-switch v-model="config.enabled" @change="updateConfig" />
        <span>启用遥测</span>
      </div>
    </div>
    
    <div v-if="config.enabled" class="setting-section">
      <h3>隐私级别</h3>
      
      <el-radio-group v-model="config.privacyMode" @change="updateConfig">
        <el-radio label="anonymous">
          <strong>匿名</strong>
          <p>仅发送错误信息，无任何设备或用户标识</p>
        </el-radio>
        
        <el-radio label="pseudonymous">
          <strong>假名</strong>
          <p>发送设备指纹用于去重，不关联账号</p>
        </el-radio>
        
        <el-radio v-if="isLoggedIn" label="identified">
          <strong>完整</strong>
          <p>关联账号以获得更好的支持体验</p>
        </el-radio>
      </el-radio-group>
    </div>
    
    <div v-if="config.enabled" class="setting-section">
      <h3>数据类型</h3>
      
      <div class="toggle-item">
        <el-switch v-model="config.sendErrors" @change="updateConfig" />
        <span>错误与崩溃报告</span>
      </div>
      
      <div class="toggle-item">
        <el-switch v-model="config.sendPerformance" @change="updateConfig" />
        <span>性能指标</span>
      </div>
      
      <div class="toggle-item">
        <el-switch v-model="config.sendUsage" @change="updateConfig" />
        <span>功能使用统计</span>
      </div>
    </div>
    
    <div class="setting-section">
      <h3>我的数据</h3>
      
      <div class="data-info">
        <p>设备指纹: <code>{{ deviceFingerprint }}</code></p>
        <p>会话数: {{ sessionCount }}</p>
        <p>最后上报: {{ lastReportTime }}</p>
      </div>
      
      <el-button type="danger" @click="deleteMyData">
        请求删除我的数据
      </el-button>
    </div>
  </div>
</template>
```

### 7.2 Dashboard 页面 (Nexus)

```vue
<!-- pages/dashboard/telemetry.vue -->
<template>
  <div class="telemetry-dashboard">
    <h1>遥测数据概览</h1>
    
    <!-- 时间范围选择器 -->
    <TimeRangePicker v-model="timeRange" />
    
    <!-- 概览卡片 -->
    <div class="stats-grid">
      <StatCard
        title="活跃设备"
        :value="stats.activeDevices"
        :trend="stats.devicesTrend"
        icon="devices"
      />
      <StatCard
        title="错误率"
        :value="stats.errorRate"
        :trend="stats.errorTrend"
        icon="error"
        :danger="stats.errorRate > 5"
      />
      <StatCard
        title="平均搜索耗时"
        :value="`${stats.avgSearchDuration}ms`"
        :trend="stats.durationTrend"
        icon="timer"
      />
      <StatCard
        title="搜索次数"
        :value="stats.totalSearches"
        icon="search"
      />
    </div>
    
    <!-- 错误分布图 -->
    <div class="chart-section">
      <h2>错误分布</h2>
      <ErrorDistributionChart :data="errorData" />
    </div>
    
    <!-- 性能趋势图 -->
    <div class="chart-section">
      <h2>性能趋势</h2>
      <PerformanceTrendChart :data="perfData" />
    </div>
    
    <!-- 热门错误表 -->
    <div class="table-section">
      <h2>热门错误</h2>
      <ErrorTable :errors="topErrors" @click="showErrorDetail" />
    </div>
    
    <!-- Provider 性能排行 -->
    <div class="table-section">
      <h2>Provider 性能</h2>
      <ProviderPerfTable :providers="providerStats" />
    </div>
  </div>
</template>
```

---

## 8. 实施计划

### Phase 1: 基础设施 (Week 1-2)

| 任务 | 优先级 | 预估 |
|-----|--------|------|
| 创建 TelemetryModule 基础结构 | P0 | 2d |
| 实现设备指纹生成 | P0 | 1d |
| 实现离线队列 (SQLite) | P0 | 2d |
| 重构 SentryService 集成 | P0 | 1d |
| 添加隐私设置 UI | P0 | 1d |

### Phase 2: 错误收集 (Week 3-4)

| 任务 | 优先级 | 预估 |
|-----|--------|------|
| 实现 ErrorCollector | P0 | 2d |
| 添加面包屑追踪 | P0 | 1d |
| 实现隐私过滤器 | P0 | 1d |
| 集成到 SearchGatherer | P1 | 1d |
| 集成到 PluginManager | P1 | 1d |
| 集成到 AppScanner | P1 | 1d |

### Phase 3: 性能监控 (Week 5-6)

| 任务 | 优先级 | 预估 |
|-----|--------|------|
| 实现 PerformanceCollector | P0 | 2d |
| 搜索性能追踪 | P0 | 1d |
| 启动性能追踪 | P1 | 1d |
| 插件性能追踪 | P1 | 1d |
| 慢查询告警 | P1 | 1d |

### Phase 4: Nexus 服务端 (Week 7-8)

| 任务 | 优先级 | 预估 |
|-----|--------|------|
| 创建 Telemetry API | P0 | 2d |
| 数据库 Schema | P0 | 1d |
| 聚合查询 API | P0 | 2d |
| Dashboard 页面 | P1 | 3d |
| 告警系统 | P2 | 2d |

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|-----|------|----------|
| 性能影响主进程 | 高 | Worker 线程处理、批量发送、采样 |
| 隐私合规风险 | 高 | 默认关闭、用户可控、最小数据 |
| 数据存储成本 | 中 | 采样、聚合、TTL 自动清理 |
| Sentry 配额限制 | 中 | 采样、去重、分优先级 |
| 离线数据丢失 | 低 | SQLite 持久化、容量限制 |

---

## 10. 成功指标

| 指标 | 目标 | 测量方式 |
|-----|------|----------|
| 错误覆盖率 | 100% uncaught | 无静默失败 |
| 性能影响 | < 5ms 延迟 | 启动时间对比 |
| 用户授权率 | > 30% | 设置页统计 |
| 错误修复周期 | < 7 天 | Sentry MTTR |
| 数据可用性 | > 99% | Nexus 监控 |

---

## 附录 A: 当前 SearchGatherer 超时问题修复

### 问题根因

```
[url-provider] → getInstalledBrowsers() → appScanner.getApps()
                                           ↓
                                    [darwin/index.ts]
                                           ↓
                                    mdfind 返回 ~520 个路径
                                           ↓
                                    逐个读取 Info.plist
                                           ↓
                                    大量 "not found" 警告 (正常)
                                           ↓
                                    总耗时 > 3000ms → TimeoutError
```

### 临时修复

1. **增加 URL Provider 超时**：`taskTimeoutMs: 5000`
2. **缓存 AppScanner 结果**：避免每次搜索重新扫描
3. **静默预期警告**：Info.plist 不存在是正常情况

### 长期修复

1. **Provider 分级超时**：快速 Provider (500ms) vs 慢速 Provider (5000ms)
2. **渐进式结果**：先返回缓存，后台更新
3. **错误分类上报**：区分真错误 vs 预期警告
