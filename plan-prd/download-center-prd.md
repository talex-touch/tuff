# 统一下载中心 PRD

## 一、产品背景

### 1.1 现状分析
当前存在多种下载场景:
- 应用更新 (GitHub Releases)
- 插件安装 (NPM/GitHub/TPEX)
- 资源文件 (图标/主题/语言包)

各模块独立处理下载,存在问题:
- 缺乏统一管理
- 无法控制并发
- 大文件易失败,无断点续传
- 缺乏进度统一展示

### 1.2 核心目标
- 建立统一下载管理服务
- 实现切片下载和断点续传
- 支持智能优先级调度
- 提供用户可配置的并发控制
- 统一的下载管理界面

## 二、功能需求

### 2.1 下载中心架构

**核心组件**:
```typescript
class DownloadCenter {
  private taskQueue: TaskQueue
  private downloadWorkers: DownloadWorker[]
  private chunkManager: ChunkManager
  private databaseService: DatabaseService
  
  async addTask(request: DownloadRequest): Promise<string>
  async pauseTask(taskId: string): Promise<void>
  async resumeTask(taskId: string): Promise<void>
  async cancelTask(taskId: string): Promise<void>
}

interface DownloadRequest {
  url: string
  destination: string
  priority: DownloadPriority
  module: DownloadModule
  checksum?: string
}

enum DownloadPriority {
  CRITICAL = 100,    // 用户手动触发
  HIGH = 80,         // 插件安装
  NORMAL = 50,       // 应用更新
  LOW = 20,          // 资源文件
  BACKGROUND = 10    // 后台预加载
}
```

### 2.2 切片下载管理

**ChunkManager**:
- 默认切片大小: 1MB
- 并发下载切片
- 下载完成后合并
- 失败切片自动重试

### 2.3 智能优先级调度

**优先级计算**:
```typescript
calculatePriority(request: DownloadRequest): number {
  basePriority * moduleMultiplier * sizeMultiplier * networkMultiplier
}
```

**调整因素**:
- 模块类型 (用户手动 > 插件 > 更新 > 资源)
- 文件大小 (小文件优先)
- 网络状况 (慢网络提高优先级)
- 用户行为 (手动启动 +20)

### 2.4 并发控制

**用户配置**:
- 最大并发数: 1-10 (默认3)
- 自动调整: 根据网络状况动态调整
- 网络感知: 网络变化时自动适配

**自动调整算法**:
- 高速网络 (>10MB/s): 并发 x 1.5
- 低速网络 (<1MB/s): 并发 x 0.5
- 不稳定网络: 并发 x 0.7

### 2.5 用户界面

**下载中心面板**:
```
┌─────────────────────────────────────┐
│ 📥 下载中心                 [设置] │
├─────────────────────────────────────┤
│ 进行中 (2)                          │
│ ┌─────────────────────────────────┐ │
│ │ 插件: touch-music      45.2MB  │ │
│ │ ████████░░ 60% 2.1MB/s 15秒    │ │
│ │ [暂停] [取消]                   │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ 等待中 (3) │ 已完成 (15) │ 失败 (2) │
└─────────────────────────────────────┘
```

**设置页面**:
- 并发下载数
- 切片大小 (512KB/1MB/2MB/4MB)
- 断点续传开关
- 自动重试次数
- 临时文件目录
- 历史记录保留期

## 三、技术设计

### 3.1 数据库设计

使用 Drizzle ORM + SQLite:

```typescript
// 下载任务表
downloadTasksSchema {
  id: text
  url: text
  destination: text
  priority: integer
  status: text
  totalSize: integer
  downloadedSize: integer
  checksum: text
  createdAt: integer
}

// 下载切片表
downloadChunksSchema {
  id: text
  taskId: text
  index: integer
  downloaded: integer
  status: text
}
```

### 3.2 IPC通道设计

**主进程通道**:
- `download:add-task`
- `download:pause-task`
- `download:resume-task`
- `download:cancel-task`

**事件广播**:
- `download:task-progress`
- `download:task-completed`
- `download:task-failed`

### 3.3 文件结构
```
apps/core-app/src/main/modules/download/
├── download-center.ts       # 主模块
├── task-queue.ts           # 优先级队列
├── download-worker.ts      # 下载工作器
├── chunk-manager.ts        # 切片管理
├── database-service.ts     # 数据库服务
└── network-monitor.ts      # 网络监控
```

## 四、实施计划

### 阶段一: 核心架构 (3-4天)
- 创建 DownloadCenter 主模块
- 实现 TaskQueue 优先级队列
- 设计数据库 Schema
- 实现基础 IPC 通道

### 阶段二: 下载引擎 (4-5天)
- 实现 DownloadWorker 并发下载
- 实现 ChunkManager 切片管理
- 实现断点续传逻辑
- 添加文件校验功能

### 阶段三: 智能调度 (2-3天)
- 实现优先级计算
- 实现并发自动调整
- 实现网络监控

### 阶段四: 用户界面 (3-4天)
- 实现下载中心主界面
- 实现任务组件
- 添加设置页面
- 实现 i18n

**总工期**: 约 12-16 天

## 五、验收标准

- 下载成功率 ≥ 95%
- 断点续传成功率 ≥ 90%
- 平均下载速度 ≥ 80% 带宽利用率
- 用户满意度 ≥ 85%

## 六、风险与缓解

### 风险识别
1. **磁盘空间不足** - 缓解: 下载前检查空间
2. **网络不稳定** - 缓解: 智能重试机制
3. **并发过多** - 缓解: 动态调整并发数

### 安全考虑
- SHA256 文件校验
- 权限控制 (防止路径遍历)
- 强制 HTTPS (可配置例外)
- 临时文件自动清理
