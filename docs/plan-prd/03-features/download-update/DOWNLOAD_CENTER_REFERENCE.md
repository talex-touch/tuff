# 下载中心参考文档

> 合并自: DOWNLOAD_CENTER_API.md + UPDATE_SYSTEM.md + MIGRATION_GUIDE.md

---

## 系统概述

统一下载中心模块,支持应用更新、插件安装、资源下载,具备切片下载、断点续传、智能调度、SHA256校验等能力。

**核心特性**:
- 智能优先级调度 (P0-P10)
- 网络自适应并发控制 (1-10)
- 切片下载 + 断点续传
- 自动重试 + 错误处理
- 数据迁移系统

**代码位置**: `apps/core-app/src/main/modules/download/`

---

## 核心 API

### 任务管理
```typescript
// 添加下载任务
async addTask(request: DownloadRequest): Promise<string>

// 控制任务
async pauseTask(taskId: string): Promise<void>
async resumeTask(taskId: string): Promise<void>
async cancelTask(taskId: string): Promise<void>
async retryTask(taskId: string): Promise<void>

// 批量操作
async pauseAllTasks(): Promise<void>
async resumeAllTasks(): Promise<void>
async cancelAllTasks(): Promise<void>

// 查询
getTaskStatus(taskId: string): DownloadTask | null
getAllTasks(): DownloadTask[]
getTasksByStatus(status: DownloadStatus): DownloadTask[]
```

### 更新系统集成
```typescript
// UpdateSystem 类
async checkForUpdates(): Promise<UpdateCheckResult>
async downloadUpdate(release: GitHubRelease): Promise<string>
async installUpdate(taskId: string): Promise<void>

// 配置
setAutoDownload(enabled: boolean): void
setAutoCheck(enabled: boolean): void
setCheckFrequency(frequency: 'startup' | 'daily' | 'weekly' | 'never'): void
ignoreVersion(version: string): void
```

---

## IPC 通道

### 下载任务
```typescript
// Renderer → Main
'download:add-task' → { success, taskId?, error? }
'download:pause-task' → { success, error? }
'download:get-tasks' → { success, tasks?, error? }

// Main → Renderer
'download:task-added' → DownloadTask
'download:task-progress' → DownloadTask
'download:task-completed' → DownloadTask
'download:task-failed' → DownloadTask
```

### 更新系统
```typescript
// Renderer → Main
'update:check' → UpdateCheckResult
'update:download' → { success, taskId?, error? }
'update:install' → { success, error? }

// Main → Renderer
'update:available' → { version, releaseNotes }
'update:download-progress' → { percentage, speed }
'update:error' → { message }
```

---

## 数据类型

### DownloadRequest（下载请求）
```typescript
interface DownloadRequest {
  url: string
  destination: string
  filename?: string
  priority?: DownloadPriority // LOW=1, NORMAL=5, HIGH=8, CRITICAL=10
  module: DownloadModule // 'app_update' | 'plugin' | 'resource' | 'user'
  checksum?: string // SHA256
}
```

### DownloadTask（下载任务）
```typescript
interface DownloadTask {
  id: string
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled'
  progress: {
    totalSize?: number
    downloadedSize: number
    speed: number
    remainingTime?: number
    percentage: number
  }
  error?: string
  createdAt: Date
  completedAt?: Date
}
```

---

## 配置选项

### DownloadConfig（下载配置）
```typescript
interface DownloadConfig {
  concurrency: {
    maxConcurrent: number // 1-10, default: 3
    autoAdjust: boolean // 自动调整, default: true
    networkAware: boolean // 网络感知, default: true
  }
  chunk: {
    size: number // 1MB default
    resume: boolean // 断点续传, default: true
    maxRetries: number // default: 3
  }
  storage: {
    tempDir: string
    historyRetention: number // 天数, default: 30
    autoCleanup: boolean // default: true
  }
}
```

---

## 性能优化

已实现:
- ✅ 数据库索引 (status/created/priority)
- ✅ 虚拟滚动 (>50项自动启用)
- ✅ 搜索防抖 (300ms)
- ✅ 进度节流 (1秒/任务)
- ✅ 任务缓存

**性能指标**:
- 500项列表渲染: 200ms → 20ms (10x)
- 数据库查询: 50-100ms → 5-10ms (5-10x)

---

## 数据迁移

### 迁移系统
```typescript
// 检查是否需要迁移
const needed = await invoke('download:check-migration-needed')

// 执行迁移
invoke('download:start-migration')

// 监听进度
on('download:migration-progress', (progress) => {
  console.log(`${progress.phase}: ${progress.percentage}%`)
})
```

### 迁移阶段
1. **Scanning**: 检查旧数据库和配置
2. **Migrating**: 迁移任务和历史
3. **Validating**: 验证数据完整性
4. **Complete**: 清理临时文件

---

## 使用示例

### 基础下载
```typescript
const result = await invoke('download:add-task', {
  url: 'https://example.com/file.zip',
  destination: '/path/to/save',
  module: 'user'
})

console.log('Task ID:', result.taskId)
```

### 监听进度
```typescript
on('download:task-progress', (task) => {
  console.log(`${task.progress.percentage}%`)
})
```

### 检查更新
```typescript
const result = await invoke('update:check')

if (result.hasUpdate) {
  const download = await invoke('update:download', result.release)
  console.log('Downloading update:', download.taskId)
}
```

---

## 错误处理

### 重试策略
自动重试最多3次,指数退避:
- Attempt 1: 立即
- Attempt 2: 5秒延迟
- Attempt 3: 10秒延迟
- Attempt 4: 20秒延迟

### 错误类型
```typescript
enum DownloadErrorType {
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  DISK_SPACE_ERROR = 'disk_space_error',
  CHECKSUM_ERROR = 'checksum_error'
}
```

---

## 最佳实践

1. ✅ 提供 checksum 保证完整性
2. ✅ 使用适当优先级 (CRITICAL 仅限应用更新)
3. ✅ 定期清理临时文件
4. ✅ 监听进度事件提升 UX
5. ✅ 检查迁移状态再启动

---

**参考原文**:
- `plan-prd/03-features/download-update/DOWNLOAD_CENTER_API.md` (710行)
- `plan-prd/03-features/download-update/UPDATE_SYSTEM.md` (106行)
- `plan-prd/03-features/download-update/MIGRATION_GUIDE.md` (353行)

**文档版本**: v2.0 (合并精简版,从1169行压缩到200行)
