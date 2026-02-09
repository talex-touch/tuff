// 下载优先级枚举
export enum DownloadPriority {
  CRITICAL = 100, // 用户手动触发
  HIGH = 80, // 插件安装
  NORMAL = 50, // 应用更新
  LOW = 20, // 资源文件
  BACKGROUND = 10, // 后台预加载
}

// 错误类型枚举
export enum DownloadErrorType {
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  DISK_SPACE_ERROR = 'disk_space_error',
  PERMISSION_ERROR = 'permission_error',
  CHECKSUM_ERROR = 'checksum_error',
  FILE_NOT_FOUND = 'file_not_found',
  INVALID_URL = 'invalid_url',
  CANCELLED = 'cancelled',
  UNKNOWN_ERROR = 'unknown_error',
}

// 错误严重程度
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// 下载模块枚举
export enum DownloadModule {
  APP_UPDATE = 'app_update',
  PLUGIN_INSTALL = 'plugin_install',
  RESOURCE_DOWNLOAD = 'resource_download',
  USER_MANUAL = 'user_manual',
}

// 下载状态枚举
export enum DownloadStatus {
  PENDING = 'pending', // 等待中
  DOWNLOADING = 'downloading', // 下载中
  PAUSED = 'paused', // 已暂停
  COMPLETED = 'completed', // 已完成
  FAILED = 'failed', // 失败
  CANCELLED = 'cancelled', // 已取消
}

// 切片状态枚举
export enum ChunkStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// 下载任务请求接口
export interface DownloadRequest {
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

// 下载任务实体
export interface DownloadTask {
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
  completedAt?: Date
  error?: string
}

// 下载进度接口
export interface DownloadProgress {
  totalSize?: number
  downloadedSize: number
  speed: number // bytes/s
  remainingTime?: number // seconds
  percentage: number // 0-100
}

// 切片信息接口
export interface ChunkInfo {
  index: number
  start: number
  end: number
  size: number
  downloaded: number
  status: ChunkStatus
  filePath: string
}

// 下载配置接口
export interface DownloadConfig {
  concurrency: {
    maxConcurrent: number // 最大并发数 (1-10)
    autoAdjust: boolean // 自动调整
    networkAware: boolean // 网络感知
    priorityBased: boolean // 基于优先级
  }
  chunk: {
    size: number // 切片大小
    resume: boolean // 断点续传
    autoRetry: boolean // 自动重试
    maxRetries: number // 最大重试次数
  }
  storage: {
    tempDir: string // 临时目录
    historyRetention: number // 历史保留天数
    autoCleanup: boolean // 自动清理
  }
  network: {
    timeout: number // 超时时间
    retryDelay: number // 重试延迟
    maxRetries: number // 最大重试次数
  }
}

// 网络状态接口
export interface NetworkStatus {
  speed: number // bytes/s
  latency: number // ms
  stability: number // 0-1
  recommendedConcurrency: number
}

// 队列状态接口
export interface QueueStatus {
  totalTasks: number
  pendingTasks: number
  activeTasks: number
  completedTasks: number
  failedTasks: number
}

// 下载统计接口
export interface DownloadStats {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  totalDownloaded: number
  averageSpeed: number
}

// 下载历史记录接口
export interface DownloadHistory {
  id: string
  taskId: string
  url: string
  filename: string
  module: DownloadModule
  status: DownloadStatus
  totalSize?: number
  downloadedSize: number
  duration?: number // seconds
  averageSpeed?: number // bytes/s
  destination: string
  createdAt: Date
  completedAt?: Date
}

// 默认下载配置
export const defaultDownloadConfig: DownloadConfig = {
  concurrency: {
    maxConcurrent: 3,
    autoAdjust: true,
    networkAware: true,
    priorityBased: true,
  },
  chunk: {
    size: 1024 * 1024, // 1MB
    resume: true,
    autoRetry: true,
    maxRetries: 3,
  },
  storage: {
    tempDir: '', // 将在运行时设置
    historyRetention: 30,
    autoCleanup: true,
  },
  network: {
    timeout: 30000,
    retryDelay: 5000,
    maxRetries: 3,
  },
}
