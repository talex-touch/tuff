# Talex Touch 统一下载中心产品需求文档 (PRD)

## 一、产品背景

### 1.1 现状分析

Talex Touch 应用目前存在多种下载场景：
- **应用更新**：通过GitHub Releases下载新版本安装包
- **插件安装**：从NPM、GitHub、TPEX等源下载插件包
- **资源文件**：下载图标、主题、语言包等资源

当前各模块独立处理下载，存在以下问题：
- 缺乏统一的下载管理
- 无法控制并发下载数量
- 大文件下载容易失败且无法断点续传
- 缺乏下载进度统一展示
- 无法根据优先级调度下载任务

### 1.2 核心痛点

1. **下载管理分散**：各模块独立实现下载逻辑，代码重复
2. **大文件下载不稳定**：缺乏切片下载和断点续传机制
3. **并发控制缺失**：可能同时启动过多下载任务，影响网络性能
4. **优先级管理混乱**：无法根据业务重要性调度下载任务
5. **用户体验差**：缺乏统一的下载进度展示和管理界面
6. **国际化缺失**：下载状态、错误提示等文案硬编码

## 二、产品目标

### 2.1 核心目标

- 建立统一的下载管理服务，支持所有下载场景
- 实现切片下载和断点续传，提升大文件下载成功率
- 支持智能优先级调度，优化下载体验
- 提供用户可配置的并发控制，平衡性能和稳定性
- 实现统一的下载管理界面，提升用户体验
- 全面支持i18n国际化，所有状态文案可本地化

### 2.2 非目标

- 本期不实现P2P下载（后续可扩展）
- 本期不实现下载加速（CDN优化）
- 本期不实现下载限速（带宽控制）

## 三、功能需求

### 3.1 下载中心架构

#### 3.1.1 核心组件设计

```typescript
// 下载中心主控制器
class DownloadCenter {
  private taskQueue: TaskQueue
  private downloadWorkers: DownloadWorker[]
  private chunkManager: ChunkManager
  private databaseService: DatabaseService
  private networkMonitor: NetworkMonitor

  // 添加下载任务
  async addTask(request: DownloadRequest): Promise<string>

  // 暂停/恢复任务
  async pauseTask(taskId: string): Promise<void>
  async resumeTask(taskId: string): Promise<void>

  // 取消任务
  async cancelTask(taskId: string): Promise<void>

  // 获取任务状态
  getTaskStatus(taskId: string): DownloadTaskStatus
  getAllTasks(): DownloadTaskStatus[]
}

// 下载任务请求
interface DownloadRequest {
  id?: string
  url: string
  destination: string
  filename?: string
  priority: DownloadPriority
  module: DownloadModule
  metadata?: Record<string, any>
  checksum?: string
  headers?: Record<string, string>
}

// 下载优先级枚举
enum DownloadPriority {
  CRITICAL = 100,    // 用户手动触发
  HIGH = 80,         // 插件安装
  NORMAL = 50,       // 应用更新
  LOW = 20,          // 资源文件
  BACKGROUND = 10    // 后台预加载
}

// 下载模块枚举
enum DownloadModule {
  APP_UPDATE = 'app_update',
  PLUGIN_INSTALL = 'plugin_install',
  RESOURCE_DOWNLOAD = 'resource_download',
  USER_MANUAL = 'user_manual'
}
```

#### 3.1.2 任务队列管理

```typescript
// 优先级队列
class TaskQueue {
  private tasks: Map<string, DownloadTask> = new Map()
  private priorityQueue: PriorityQueue<DownloadTask>

  // 添加任务到队列
  enqueue(task: DownloadTask): void

  // 获取下一个待执行任务
  dequeue(): DownloadTask | null

  // 更新任务优先级
  updatePriority(taskId: string, priority: DownloadPriority): void

  // 获取队列状态
  getQueueStatus(): QueueStatus
}

// 下载任务实体
interface DownloadTask {
  id: string
  url: string
  destination: string
  filename: string
  priority: DownloadPriority
  module: DownloadModule
  status: DownloadStatus
  progress: DownloadProgress
  chunks: ChunkInfo[]
  metadata: Record<string, any>
  createdAt: Date
  updatedAt: Date
  error?: string
}

// 下载状态枚举
enum DownloadStatus {
  PENDING = 'pending',       // 等待中
  DOWNLOADING = 'downloading', // 下载中
  PAUSED = 'paused',         // 已暂停
  COMPLETED = 'completed',   // 已完成
  FAILED = 'failed',         // 失败
  CANCELLED = 'cancelled'    // 已取消
}
```

#### 3.1.3 切片下载管理

```typescript
// 切片管理器
class ChunkManager {
  private readonly chunkSize: number = 1024 * 1024 // 1MB per chunk

  // 创建下载切片
  createChunks(task: DownloadTask): ChunkInfo[]

  // 合并切片文件
  async mergeChunks(task: DownloadTask): Promise<void>

  // 验证切片完整性
  async validateChunks(task: DownloadTask): Promise<boolean>

  // 清理失败的切片
  async cleanupChunks(task: DownloadTask): Promise<void>
}

// 切片信息
interface ChunkInfo {
  index: number
  start: number
  end: number
  size: number
  downloaded: number
  status: ChunkStatus
  filePath: string
}

enum ChunkStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  COMPLETED = 'completed',
  FAILED = 'failed'
}
```

#### 3.1.4 并发下载工作器

```typescript
// 下载工作器
class DownloadWorker {
  private readonly maxConcurrent: number
  private activeTasks: Set<string> = new Set()
  private networkMonitor: NetworkMonitor

  // 启动下载任务
  async startTask(task: DownloadTask): Promise<void>

  // 暂停下载任务
  async pauseTask(taskId: string): Promise<void>

  // 恢复下载任务
  async resumeTask(taskId: string): Promise<void>

  // 取消下载任务
  async cancelTask(taskId: string): Promise<void>

  // 下载单个切片
  private async downloadChunk(chunk: ChunkInfo, task: DownloadTask): Promise<void>
}

// 网络监控器
class NetworkMonitor {
  private speedHistory: number[] = []
  private latencyHistory: number[] = []

  // 监控网络状况
  async monitorNetwork(): Promise<NetworkStatus>

  // 获取建议的并发数
  getRecommendedConcurrency(): number

  // 检测网络变化
  onNetworkChange(callback: (status: NetworkStatus) => void): void
}

interface NetworkStatus {
  speed: number        // bytes/s
  latency: number      // ms
  stability: number     // 0-1
  recommendedConcurrency: number
}
```

### 3.2 数据库设计

#### 3.2.1 数据表结构

使用Drizzle ORM设计SQLite数据库：

```typescript
// 下载任务表
export const downloadTasksSchema = sqliteTable('download_tasks', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  destination: text('destination').notNull(),
  filename: text('filename').notNull(),
  priority: integer('priority').notNull(),
  module: text('module').notNull(),
  status: text('status').notNull(),
  totalSize: integer('total_size'),
  downloadedSize: integer('downloaded_size').default(0),
  checksum: text('checksum'),
  metadata: text('metadata'), // JSON string
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  completedAt: integer('completed_at'),
  error: text('error')
})

// 下载切片表
export const downloadChunksSchema = sqliteTable('download_chunks', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => downloadTasksSchema.id),
  index: integer('index').notNull(),
  start: integer('start').notNull(),
  end: integer('end').notNull(),
  size: integer('size').notNull(),
  downloaded: integer('downloaded').default(0),
  status: text('status').notNull(),
  filePath: text('file_path').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

// 下载历史表
export const downloadHistorySchema = sqliteTable('download_history', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  url: text('url').notNull(),
  filename: text('filename').notNull(),
  module: text('module').notNull(),
  status: text('status').notNull(),
  totalSize: integer('total_size'),
  downloadedSize: integer('downloaded_size'),
  duration: integer('duration'), // seconds
  averageSpeed: integer('average_speed'), // bytes/s
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at')
})
```

#### 3.2.2 数据库服务

```typescript
// 数据库服务
class DatabaseService {
  private db: DrizzleDatabase

  // 保存下载任务
  async saveTask(task: DownloadTask): Promise<void>

  // 更新任务状态
  async updateTaskStatus(taskId: string, status: DownloadStatus): Promise<void>

  // 更新下载进度
  async updateProgress(taskId: string, progress: DownloadProgress): Promise<void>

  // 保存切片信息
  async saveChunks(taskId: string, chunks: ChunkInfo[]): Promise<void>

  // 更新切片状态
  async updateChunkStatus(chunkId: string, status: ChunkStatus): Promise<void>

  // 获取任务历史
  async getTaskHistory(limit?: number): Promise<DownloadTask[]>

  // 清理过期数据
  async cleanupExpiredData(days: number = 30): Promise<void>
}
```

### 3.3 智能优先级调度

#### 3.3.1 优先级计算算法

```typescript
// 优先级计算器
class PriorityCalculator {
  // 计算任务优先级
  calculatePriority(request: DownloadRequest): DownloadPriority {
    let basePriority = request.priority

    // 根据模块调整
    const moduleMultiplier = this.getModuleMultiplier(request.module)

    // 根据文件大小调整
    const sizeMultiplier = this.getSizeMultiplier(request.metadata?.fileSize)

    // 根据网络状况调整
    const networkMultiplier = this.getNetworkMultiplier()

    return Math.min(100, Math.max(1,
      basePriority * moduleMultiplier * sizeMultiplier * networkMultiplier
    ))
  }

  private getModuleMultiplier(module: DownloadModule): number {
    const multipliers = {
      [DownloadModule.USER_MANUAL]: 1.2,
      [DownloadModule.PLUGIN_INSTALL]: 1.1,
      [DownloadModule.APP_UPDATE]: 1.0,
      [DownloadModule.RESOURCE_DOWNLOAD]: 0.9
    }
    return multipliers[module] || 1.0
  }

  private getSizeMultiplier(fileSize?: number): number {
    if (!fileSize) return 1.0

    // 小文件优先级稍高
    if (fileSize < 10 * 1024 * 1024) return 1.1 // < 10MB
    if (fileSize > 100 * 1024 * 1024) return 0.9 // > 100MB
    return 1.0
  }

  private getNetworkMultiplier(): number {
    // 根据网络状况动态调整
    const networkStatus = NetworkMonitor.getCurrentStatus()
    if (networkStatus.speed < 1024 * 1024) return 1.2 // 慢网络
    if (networkStatus.speed > 10 * 1024 * 1024) return 0.8 // 快网络
    return 1.0
  }
}
```

#### 3.3.2 动态优先级调整

```typescript
// 优先级调整器
class PriorityAdjuster {
  // 根据用户行为调整优先级
  adjustByUserAction(taskId: string, action: UserAction): void {
    switch (action) {
      case UserAction.MANUAL_START:
        this.boostPriority(taskId, 20)
        break
      case UserAction.FREQUENT_RETRY:
        this.boostPriority(taskId, 10)
        break
      case UserAction.IGNORE:
        this.lowerPriority(taskId, 30)
        break
    }
  }

  // 根据时间调整优先级
  adjustByTime(taskId: string): void {
    const task = this.getTask(taskId)
    const age = Date.now() - task.createdAt.getTime()

    // 超过1小时的任务优先级降低
    if (age > 60 * 60 * 1000) {
      this.lowerPriority(taskId, 10)
    }
  }
}

enum UserAction {
  MANUAL_START = 'manual_start',
  FREQUENT_RETRY = 'frequent_retry',
  IGNORE = 'ignore',
  PAUSE = 'pause',
  RESUME = 'resume'
}
```

### 3.4 并发控制

#### 3.4.1 用户配置

```typescript
// 并发配置
interface ConcurrencyConfig {
  maxConcurrent: number        // 最大并发数 (1-10)
  autoAdjust: boolean          // 自动调整
  networkAware: boolean       // 网络感知
  priorityBased: boolean       // 基于优先级
}

// 默认配置
const defaultConcurrencyConfig: ConcurrencyConfig = {
  maxConcurrent: 3,
  autoAdjust: true,
  networkAware: true,
  priorityBased: true
}
```

#### 3.4.2 自动调整算法

```typescript
// 并发调整器
class ConcurrencyAdjuster {
  private config: ConcurrencyConfig
  private networkMonitor: NetworkMonitor

  // 计算建议的并发数
  calculateRecommendedConcurrency(): number {
    const networkStatus = this.networkMonitor.getCurrentStatus()
    const baseConcurrency = this.config.maxConcurrent

    if (!this.config.autoAdjust) {
      return baseConcurrency
    }

    // 根据网络速度调整
    let multiplier = 1.0
    if (networkStatus.speed > 10 * 1024 * 1024) multiplier = 1.5 // > 10MB/s
    else if (networkStatus.speed < 1 * 1024 * 1024) multiplier = 0.5 // < 1MB/s

    // 根据网络稳定性调整
    if (networkStatus.stability < 0.5) multiplier *= 0.7

    return Math.max(1, Math.min(10, Math.round(baseConcurrency * multiplier)))
  }

  // 动态调整并发数
  adjustConcurrency(): void {
    const recommended = this.calculateRecommendedConcurrency()
    const current = this.getCurrentConcurrency()

    if (recommended !== current) {
      this.updateConcurrency(recommended)
    }
  }
}
```

### 3.5 用户界面

#### 3.5.1 下载中心面板

**界面布局**：
```
┌─────────────────────────────────────────────────────────┐
│  📥 下载中心                                    [设置]  │
├─────────────────────────────────────────────────────────┤
│  进行中 (2)                                             │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 🔄 插件安装: touch-music v1.2.0             45.2MB │ │
│  │ ████████████░░░░░░░░░░ 60% 2.1MB/s 剩余 15秒        │ │
│  │ [暂停] [取消]                                      │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 🔄 应用更新: TalexTouch v2.1.0              89.5MB │ │
│  │ ████████████████░░░░ 80% 3.2MB/s 剩余 8秒          │ │
│  │ [暂停] [取消]                                      │ │
│  └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│  等待中 (3)                                             │
│  • 资源文件: icon-pack-v2.zip                   12.3MB │
│  • 插件安装: touch-translation v1.0.5           8.7MB  │
│  • 资源文件: theme-dark.zip                     5.2MB  │
├─────────────────────────────────────────────────────────┤
│  已完成 (15) [查看全部]                                │
│  失败 (2) [重试全部]                                   │
└─────────────────────────────────────────────────────────┘
```

#### 3.5.2 设置页面

**下载设置模块**：
```
┌─────────────────────────────────────────────────────────┐
│  📥 下载设置                                           │
├─────────────────────────────────────────────────────────┤
│  并发下载数: [3 ▼] (1-10)                             │
│  ✅ 自动调整并发数                                     │
│  ✅ 网络感知调整                                       │
│  ✅ 基于优先级调度                                     │
├─────────────────────────────────────────────────────────┤
│  切片设置                                             │
│  切片大小: [1MB ▼] (512KB, 1MB, 2MB, 4MB)            │
│  ✅ 断点续传                                           │
│  ✅ 自动重试 (最多3次)                                 │
├─────────────────────────────────────────────────────────┤
│  存储设置                                             │
│  临时文件目录: /Users/xxx/Downloads/TalexTouch         │
│  历史记录保留: [30天 ▼] (7天, 30天, 90天, 永久)       │
│  ✅ 下载完成后自动清理临时文件                          │
└─────────────────────────────────────────────────────────┘
```

### 3.6 国际化支持

#### 3.6.1 i18n Key 清单

**下载中心界面文案**：
```json
{
  "download": {
    "title": "下载中心",
    "settings": "设置",
    "downloading": "进行中",
    "waiting": "等待中",
    "completed": "已完成",
    "failed": "失败",
    "view_all": "查看全部",
    "retry_all": "重试全部",
    "pause": "暂停",
    "resume": "继续",
    "cancel": "取消",
    "retry": "重试",
    "remove": "移除",
    "speed": "速度",
    "remaining": "剩余",
    "size": "大小",
    "progress": "进度"
  }
}
```

**下载状态文案**：
```json
{
  "download": {
    "status": {
      "pending": "等待中",
      "downloading": "下载中",
      "paused": "已暂停",
      "completed": "已完成",
      "failed": "下载失败",
      "cancelled": "已取消"
    },
    "error": {
      "network": "网络连接失败",
      "timeout": "下载超时",
      "disk_full": "磁盘空间不足",
      "permission": "权限不足",
      "checksum": "文件校验失败",
      "unknown": "未知错误"
    }
  }
}
```

**设置页面文案**：
```json
{
  "settings": {
    "download": {
      "title": "下载设置",
      "concurrency": "并发下载数",
      "auto_adjust": "自动调整并发数",
      "network_aware": "网络感知调整",
      "priority_based": "基于优先级调度",
      "chunk_size": "切片大小",
      "resume": "断点续传",
      "auto_retry": "自动重试",
      "temp_dir": "临时文件目录",
      "history_retention": "历史记录保留",
      "auto_cleanup": "下载完成后自动清理临时文件"
    }
  }
}
```

## 四、技术设计

### 4.1 模块架构

```
DownloadCenter (主进程模块)
├── TaskQueue (优先级队列)
├── DownloadWorker[] (并发下载工作器)
├── ChunkManager (切片管理)
├── DatabaseService (SQLite持久化)
├── NetworkMonitor (网络状况监控)
├── PriorityCalculator (优先级计算)
├── ConcurrencyAdjuster (并发调整)
└── DownloadCenterUI (前端界面)
```

### 4.2 文件结构

**新增文件**：
- `apps/core-app/src/main/modules/download/download-center.ts` - 下载中心主模块
- `apps/core-app/src/main/modules/download/task-queue.ts` - 任务队列
- `apps/core-app/src/main/modules/download/download-worker.ts` - 下载工作器
- `apps/core-app/src/main/modules/download/chunk-manager.ts` - 切片管理
- `apps/core-app/src/main/modules/download/database-service.ts` - 数据库服务
- `apps/core-app/src/main/modules/download/network-monitor.ts` - 网络监控
- `apps/core-app/src/main/modules/download/priority-calculator.ts` - 优先级计算
- `apps/core-app/src/main/modules/download/concurrency-adjuster.ts` - 并发调整
- `apps/core-app/src/renderer/src/components/download/DownloadCenter.vue` - 下载中心界面
- `apps/core-app/src/renderer/src/components/download/DownloadTask.vue` - 下载任务组件

### 4.3 IPC通道设计

**主进程通道**：
- `download:add-task` - 添加下载任务
- `download:pause-task` - 暂停任务
- `download:resume-task` - 恢复任务
- `download:cancel-task` - 取消任务
- `download:get-tasks` - 获取任务列表
- `download:get-progress` - 获取下载进度
- `download:update-config` - 更新配置

**事件广播**：
- `download:task-added` - 任务已添加
- `download:task-progress` - 任务进度更新
- `download:task-completed` - 任务完成
- `download:task-failed` - 任务失败
- `download:task-cancelled` - 任务取消

### 4.4 配置管理

**下载配置**：
```json
{
  "download": {
    "concurrency": {
      "maxConcurrent": 3,
      "autoAdjust": true,
      "networkAware": true,
      "priorityBased": true
    },
    "chunk": {
      "size": 1048576,
      "resume": true,
      "autoRetry": true,
      "maxRetries": 3
    },
    "storage": {
      "tempDir": "/Users/xxx/Downloads/TalexTouch",
      "historyRetention": 30,
      "autoCleanup": true
    }
  }
}
```

## 五、安全考虑

### 5.1 文件校验
- 支持SHA256、MD5等校验算法
- 下载完成后自动校验文件完整性
- 校验失败时自动重试或提示用户

### 5.2 权限控制
- 限制下载目录访问权限
- 防止路径遍历攻击
- 临时文件自动清理

### 5.3 网络安全
- 强制HTTPS下载（可配置例外）
- 支持自定义请求头
- 防止恶意URL攻击

## 六、实施计划

### 阶段一：核心架构（3-4天）
- [ ] 创建DownloadCenter主模块
- [ ] 实现TaskQueue优先级队列
- [ ] 设计数据库Schema和DatabaseService
- [ ] 实现基础IPC通道

### 阶段二：下载引擎（4-5天）
- [ ] 实现DownloadWorker并发下载
- [ ] 实现ChunkManager切片管理
- [ ] 实现断点续传逻辑
- [ ] 添加文件校验功能

### 阶段三：智能调度（2-3天）
- [ ] 实现PriorityCalculator
- [ ] 实现ConcurrencyAdjuster
- [ ] 实现NetworkMonitor
- [ ] 添加动态优先级调整

### 阶段四：用户界面（3-4天）
- [ ] 实现DownloadCenter.vue主界面
- [ ] 实现DownloadTask.vue任务组件
- [ ] 添加设置页面集成
- [ ] 实现i18n国际化

### 阶段五：测试与优化（2-3天）
- [ ] 单元测试（核心算法）
- [ ] 集成测试（完整下载流程）
- [ ] 性能测试（并发下载）
- [ ] 用户体验优化

## 七、衡量指标

- **下载成功率**：≥ 95%（7 日均值）
- **断点续传成功率**：≥ 90%（中断后恢复下载）
- **平均下载速度**：≥ 80% 网络带宽利用率
- **用户满意度**：≥ 85%（下载体验评分）

## 八、风险与缓解

### 8.1 风险识别
1. **磁盘空间不足**：大文件下载可能耗尽磁盘空间
   - 缓解：下载前检查可用空间，提供清理建议

2. **网络不稳定**：频繁断网导致下载失败
   - 缓解：智能重试机制，网络恢复自动继续

3. **并发过多**：影响系统性能
   - 缓解：动态调整并发数，网络感知调度

### 8.2 回滚方案
如下载中心出现严重问题：
- 降级到原有下载方式
- 提供手动下载指引
- 紧急修复并发布补丁

## 九、附录

### 9.1 相关文件清单
- `apps/core-app/src/main/modules/plugin/providers/utils.ts` - 现有下载工具参考
- `apps/core-app/src/main/core/channel-core.ts` - IPC通道系统
- `apps/core-app/src/main/modules/storage/storage-provider.ts` - 配置管理参考

### 9.2 API示例

**添加下载任务**：
```typescript
// 应用更新下载
const updateTask = await downloadCenter.addTask({
  url: 'https://github.com/talex-touch/tuff/releases/download/v2.1.0/TalexTouch-2.1.0-win-x64.exe',
  destination: '/Users/xxx/Downloads/',
  filename: 'TalexTouch-2.1.0-win-x64.exe',
  priority: DownloadPriority.NORMAL,
  module: DownloadModule.APP_UPDATE,
  checksum: 'sha256:abcd1234...'
})

// 插件安装下载
const pluginTask = await downloadCenter.addTask({
  url: 'https://registry.npmjs.org/@talex-touch/plugin-music/-/plugin-music-1.2.0.tgz',
  destination: '/Users/xxx/.talex-touch/plugins/',
  filename: 'plugin-music-1.2.0.tgz',
  priority: DownloadPriority.HIGH,
  module: DownloadModule.PLUGIN_INSTALL
})
```

### 9.3 配置示例

**完整下载配置**：
```json
{
  "download": {
    "concurrency": {
      "maxConcurrent": 3,
      "autoAdjust": true,
      "networkAware": true,
      "priorityBased": true
    },
    "chunk": {
      "size": 1048576,
      "resume": true,
      "autoRetry": true,
      "maxRetries": 3
    },
    "storage": {
      "tempDir": "/Users/xxx/Downloads/TalexTouch",
      "historyRetention": 30,
      "autoCleanup": true
    },
    "network": {
      "timeout": 30000,
      "retryDelay": 5000,
      "maxRetries": 3
    }
  }
}
```
