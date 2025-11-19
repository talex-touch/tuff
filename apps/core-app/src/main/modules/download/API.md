# Download Center API Documentation

## Overview

The Download Center provides a unified API for managing all download tasks in the application, including application updates, plugin installations, and resource downloads.

## Table of Contents

- [Core Classes](#core-classes)
- [IPC Channels](#ipc-channels)
- [Data Types](#data-types)
- [Usage Examples](#usage-examples)
- [Error Handling](#error-handling)

## Core Classes

### DownloadCenterModule

The main module that manages all download operations.

#### Methods

##### Task Management

```typescript
/**
 * Add a new download task
 * @param request - Download request configuration
 * @returns Task ID
 */
async addTask(request: DownloadRequest): Promise<string>

/**
 * Pause a download task
 * @param taskId - Task identifier
 */
async pauseTask(taskId: string): Promise<void>

/**
 * Resume a paused task
 * @param taskId - Task identifier
 */
async resumeTask(taskId: string): Promise<void>

/**
 * Cancel a download task
 * @param taskId - Task identifier
 */
async cancelTask(taskId: string): Promise<void>

/**
 * Retry a failed task
 * @param taskId - Task identifier
 */
async retryTask(taskId: string): Promise<void>
```

##### Batch Operations

```typescript
/**
 * Pause all active and pending tasks
 */
async pauseAllTasks(): Promise<void>

/**
 * Resume all paused tasks
 */
async resumeAllTasks(): Promise<void>

/**
 * Cancel all tasks (except completed)
 */
async cancelAllTasks(): Promise<void>
```

##### Query Operations

```typescript
/**
 * Get task status
 * @param taskId - Task identifier
 * @returns Task object or null
 */
getTaskStatus(taskId: string): DownloadTask | null

/**
 * Get all tasks
 * @returns Array of all tasks
 */
getAllTasks(): DownloadTask[]

/**
 * Get tasks filtered by status
 * @param status - Download status
 * @returns Array of filtered tasks
 */
getTasksByStatus(status: DownloadStatus): DownloadTask[]

/**
 * Get download history
 * @param limit - Maximum number of records (default: 50)
 * @returns Array of history records
 */
async getTaskHistory(limit?: number): Promise<DownloadHistory[]>
```

##### File Operations

```typescript
/**
 * Open downloaded file with default application
 * @param taskId - Task identifier
 */
async openFile(taskId: string): Promise<void>

/**
 * Show file in system file manager
 * @param taskId - Task identifier
 */
async showInFolder(taskId: string): Promise<void>

/**
 * Delete downloaded file
 * @param taskId - Task identifier
 */
async deleteFile(taskId: string): Promise<void>
```

##### Configuration

```typescript
/**
 * Get current configuration
 * @returns Download configuration
 */
getConfig(): DownloadConfig

/**
 * Update configuration
 * @param config - Partial configuration to update
 */
updateConfig(config: Partial<DownloadConfig>): void

/**
 * Update notification configuration
 * @param config - Partial notification configuration
 */
updateNotificationConfig(config: Partial<NotificationConfig>): void

/**
 * Get notification configuration
 * @returns Notification configuration
 */
getNotificationConfig(): NotificationConfig
```

##### Maintenance

```typescript
/**
 * Clear all history records
 */
async clearHistory(): Promise<void>

/**
 * Clear single history record
 * @param historyId - History record identifier
 */
async clearHistoryItem(historyId: string): Promise<void>

/**
 * Clean up orphaned temporary files
 */
async cleanupTempFiles(): Promise<void>

/**
 * Get temporary file statistics
 * @returns Statistics object
 */
async getTempFileStats(): Promise<{
  totalSize: number
  fileCount: number
  directoryCount: number
  orphanedCount: number
}>
```

### UpdateSystem

Manages application updates and integrates with DownloadCenter.

#### Methods

```typescript
/**
 * Check for available updates
 * @returns Update check result
 */
async checkForUpdates(): Promise<UpdateCheckResult>

/**
 * Download update package
 * @param release - GitHub release object
 * @returns Download task ID
 */
async downloadUpdate(release: GitHubRelease): Promise<string>

/**
 * Install downloaded update
 * @param taskId - Download task ID
 */
async installUpdate(taskId: string): Promise<void>

/**
 * Get current application version
 * @returns Version string
 */
getCurrentVersion(): string

/**
 * Compare two version strings
 * @param v1 - First version
 * @param v2 - Second version
 * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
compareVersions(v1: string, v2: string): number

/**
 * Ignore a specific version
 * @param version - Version to ignore
 */
ignoreVersion(version: string): void

/**
 * Set auto download preference
 * @param enabled - Enable/disable auto download
 */
setAutoDownload(enabled: boolean): void

/**
 * Set auto check preference
 * @param enabled - Enable/disable auto check
 */
setAutoCheck(enabled: boolean): void

/**
 * Set check frequency
 * @param frequency - Check frequency
 */
setCheckFrequency(frequency: 'startup' | 'daily' | 'weekly' | 'never'): void

/**
 * Get configuration
 * @returns Update system configuration
 */
getConfig(): UpdateSystemConfig

/**
 * Update configuration
 * @param config - Partial configuration
 */
updateConfig(config: Partial<UpdateSystemConfig>): void
```

## IPC Channels

### Download Center Channels

#### Requests (Renderer → Main)

```typescript
// Add download task
'download:add-task' → { success: boolean, taskId?: string, error?: string }

// Task control
'download:pause-task' → { success: boolean, error?: string }
'download:resume-task' → { success: boolean, error?: string }
'download:cancel-task' → { success: boolean, error?: string }
'download:retry-task' → { success: boolean, error?: string }

// Batch operations
'download:pause-all-tasks' → { success: boolean, error?: string }
'download:resume-all-tasks' → { success: boolean, error?: string }
'download:cancel-all-tasks' → { success: boolean, error?: string }

// Query operations
'download:get-tasks' → { success: boolean, tasks?: DownloadTask[], error?: string }
'download:get-task-status' → { success: boolean, task?: DownloadTask, error?: string }
'download:get-tasks-by-status' → { success: boolean, tasks?: DownloadTask[], error?: string }
'download:get-history' → { success: boolean, history?: DownloadHistory[], error?: string }

// File operations
'download:open-file' → { success: boolean, error?: string }
'download:show-in-folder' → { success: boolean, error?: string }
'download:delete-file' → { success: boolean, error?: string }

// Configuration
'download:get-config' → { success: boolean, config?: DownloadConfig, error?: string }
'download:update-config' → { success: boolean, error?: string }
'download:get-notification-config' → { success: boolean, config?: NotificationConfig, error?: string }
'download:update-notification-config' → { success: boolean, error?: string }

// Maintenance
'download:clear-history' → { success: boolean, error?: string }
'download:clear-history-item' → { success: boolean, error?: string }
'download:cleanup-temp' → { success: boolean, error?: string }
'download:get-temp-stats' → { success: boolean, stats?: TempFileStats, error?: string }

// Error logging
'download:get-logs' → { success: boolean, logs?: ErrorLog[], error?: string }
'download:get-error-stats' → { success: boolean, stats?: ErrorStats, error?: string }
'download:clear-logs' → { success: boolean, error?: string }

// Migration
'download:check-migration-needed' → { success: boolean, needed?: boolean, error?: string }
'download:start-migration' → { success: boolean, result?: MigrationResult, error?: string }
'download:retry-migration' → { success: boolean, result?: MigrationResult, error?: string }
'download:get-migration-status' → { success: boolean, currentVersion?: number, appliedMigrations?: Migration[], error?: string }
```

#### Events (Main → Renderer)

```typescript
// Task events
'download:task-added' → DownloadTask
'download:task-progress' → DownloadTask
'download:task-completed' → DownloadTask
'download:task-failed' → DownloadTask
'download:task-updated' → DownloadTask
'download:task-retrying' → { taskId: string, attempt: number, error: string, delay: number }

// Notification events
'download:notification-clicked' → { taskId: string, action: string }

// Migration events
'download:migration-progress' → MigrationProgress
'download:migration-result' → MigrationResult
```

### Update System Channels

#### Requests (Renderer → Main)

```typescript
'update:check' → UpdateCheckResult
'update:download' → { success: boolean, taskId?: string, error?: string }
'update:install' → { success: boolean, error?: string }
'update:ignore-version' → { success: boolean }
'update:set-auto-download' → { success: boolean }
'update:set-auto-check' → { success: boolean }
'update:get-settings' → UpdateSystemConfig
'update:update-settings' → { success: boolean }
'update:get-status' → UpdateStatus
'update:clear-cache' → { success: boolean }
```

#### Events (Main → Renderer)

```typescript
'update:available' → { version: string, releaseNotes: string }
'update:download-progress' → { percentage: number, speed: string }
'update:download-complete' → { version: string, taskId: string }
'update:error' → { message: string }
```

## Data Types

### DownloadRequest

```typescript
interface DownloadRequest {
  id?: string // Optional task ID
  url: string // Download URL
  destination: string // Save directory path
  filename?: string // Optional filename (defaults to URL basename)
  priority?: DownloadPriority // Task priority (default: NORMAL)
  module: DownloadModule // Module identifier
  metadata?: Record<string, any> // Optional metadata
  checksum?: string // Optional SHA256 checksum
}
```

### DownloadTask

```typescript
interface DownloadTask {
  id: string
  url: string
  destination: string
  filename: string
  priority: number
  module: DownloadModule
  status: DownloadStatus
  progress: {
    totalSize?: number
    downloadedSize: number
    speed: number
    remainingTime?: number
    percentage: number
  }
  chunks: ChunkInfo[]
  metadata: Record<string, any>
  error?: string
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
}
```

### DownloadStatus

```typescript
enum DownloadStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}
```

### DownloadPriority

```typescript
enum DownloadPriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 8,
  CRITICAL = 10
}
```

### DownloadModule

```typescript
enum DownloadModule {
  APP_UPDATE = 'app_update',
  PLUGIN = 'plugin',
  RESOURCE = 'resource',
  USER = 'user'
}
```

### DownloadConfig

```typescript
interface DownloadConfig {
  concurrency: {
    maxConcurrent: number // 1-10, default: 3
    autoAdjust: boolean // default: true
    networkAware: boolean // default: true
    priorityBased: boolean // default: true
  }
  chunk: {
    size: number // bytes, default: 1MB
    resume: boolean // default: true
    autoRetry: boolean // default: true
    maxRetries: number // default: 3
  }
  storage: {
    tempDir: string // temporary directory path
    historyRetention: number // days, default: 30
    autoCleanup: boolean // default: true
  }
  network: {
    timeout: number // milliseconds, default: 30000
    retryDelay: number // milliseconds, default: 5000
    maxRetries: number // default: 3
  }
}
```

## Usage Examples

### Basic Download

```typescript
// Renderer process
const result = await window.electron.ipcRenderer.invoke('download:add-task', {
  url: 'https://example.com/file.zip',
  destination: '/path/to/save',
  filename: 'file.zip',
  module: 'user'
})

if (result.success) {
  console.log('Download started:', result.taskId)
}
```

### Monitor Progress

```typescript
// Renderer process
window.electron.ipcRenderer.on('download:task-progress', (task) => {
  console.log(`Progress: ${task.progress.percentage}%`)
  console.log(`Speed: ${task.progress.speed} bytes/s`)
  console.log(`Remaining: ${task.progress.remainingTime}s`)
})
```

### Check for Updates

```typescript
// Renderer process
const result = await window.electron.ipcRenderer.invoke('update:check')

if (result.hasUpdate && result.release) {
  console.log('New version available:', result.release.tag_name)

  // Download update
  const downloadResult = await window.electron.ipcRenderer.invoke(
    'update:download',
    result.release
  )

  if (downloadResult.success) {
    console.log('Update download started:', downloadResult.taskId)
  }
}
```

### Batch Operations

```typescript
// Pause all downloads
await window.electron.ipcRenderer.invoke('download:pause-all-tasks')

// Resume all downloads
await window.electron.ipcRenderer.invoke('download:resume-all-tasks')

// Cancel all downloads
await window.electron.ipcRenderer.invoke('download:cancel-all-tasks')
```

### Configuration Management

```typescript
// Get current config
const configResult = await window.electron.ipcRenderer.invoke('download:get-config')
console.log('Current config:', configResult.config)

// Update config
await window.electron.ipcRenderer.invoke('download:update-config', {
  concurrency: {
    maxConcurrent: 5
  },
  chunk: {
    size: 2 * 1024 * 1024 // 2MB chunks
  }
})
```

### File Operations

```typescript
// Open downloaded file
await window.electron.ipcRenderer.invoke('download:open-file', taskId)

// Show in folder
await window.electron.ipcRenderer.invoke('download:show-in-folder', taskId)

// Delete file
await window.electron.ipcRenderer.invoke('download:delete-file', taskId)
```

### History Management

```typescript
// Get history
const historyResult = await window.electron.ipcRenderer.invoke(
  'download:get-history',
  50 // limit
)

// Clear all history
await window.electron.ipcRenderer.invoke('download:clear-history')

// Clear single item
await window.electron.ipcRenderer.invoke('download:clear-history-item', historyId)
```

### Temporary File Management

```typescript
// Get temp file stats
const statsResult = await window.electron.ipcRenderer.invoke('download:get-temp-stats')
console.log('Temp files:', statsResult.stats)

// Clean up temp files
await window.electron.ipcRenderer.invoke('download:cleanup-temp')
```

## Error Handling

### Error Types

```typescript
enum DownloadErrorType {
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  DISK_SPACE_ERROR = 'disk_space_error',
  PERMISSION_ERROR = 'permission_error',
  CHECKSUM_ERROR = 'checksum_error',
  UNKNOWN_ERROR = 'unknown_error'
}
```

### Error Object

```typescript
interface DownloadError {
  type: DownloadErrorType
  message: string
  userMessage: string
  details?: any
  timestamp: number
  taskId: string
  url: string
  filename: string
  module: string
}
```

### Handling Errors

```typescript
// Listen for failed tasks
window.electron.ipcRenderer.on('download:task-failed', (task) => {
  console.error('Download failed:', task.error)

  // Retry if needed
  if (shouldRetry(task)) {
    window.electron.ipcRenderer.invoke('download:retry-task', task.id)
  }
})

// Get error logs
const logsResult = await window.electron.ipcRenderer.invoke('download:get-logs', 100)
console.log('Error logs:', logsResult.logs)

// Get error statistics
const statsResult = await window.electron.ipcRenderer.invoke('download:get-error-stats')
console.log('Error stats:', statsResult.stats)
```

### Retry Strategy

The download center automatically retries failed downloads up to 3 times with exponential backoff:

- Attempt 1: Immediate
- Attempt 2: 5 seconds delay
- Attempt 3: 10 seconds delay
- Attempt 4: 20 seconds delay

You can also manually retry a failed task:

```typescript
await window.electron.ipcRenderer.invoke('download:retry-task', taskId)
```

## Best Practices

1. **Always handle errors**: Check the `success` field in IPC responses
2. **Use appropriate priorities**: Reserve CRITICAL for app updates only
3. **Clean up regularly**: Use `cleanupTempFiles()` periodically
4. **Monitor progress**: Subscribe to progress events for better UX
5. **Verify checksums**: Provide checksums when available for integrity
6. **Respect user settings**: Check notification config before showing notifications
7. **Handle migrations**: Check for migration needs on app startup
8. **Log errors**: Use error logging for debugging and support

## Performance Considerations

- **Virtual scrolling**: Automatically enabled for lists > 50 items
- **Progress throttling**: Updates limited to 1 per second per task
- **Database indexes**: Optimized queries for common operations
- **Task caching**: In-memory cache for faster lookups
- **Debounced search**: 300ms delay for search input

See [PERFORMANCE_OPTIMIZATIONS.md](./PERFORMANCE_OPTIMIZATIONS.md) for details.

## Migration

For migrating from old download systems, see [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md).

## Support

For issues or questions:
1. Check error logs: `download:get-logs`
2. Review error statistics: `download:get-error-stats`
3. Check TypeScript diagnostics
4. Review performance metrics

## Related Documentation

- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Data migration guide
- [PERFORMANCE_OPTIMIZATIONS.md](./PERFORMANCE_OPTIMIZATIONS.md) - Performance details
- [PERFORMANCE_QUICK_REFERENCE.md](./PERFORMANCE_QUICK_REFERENCE.md) - Quick reference
- [PROGRESS_TRACKER_USAGE.md](./PROGRESS_TRACKER_USAGE.md) - Progress tracking guide
- [Update System README](../update/README.md) - Update system documentation
