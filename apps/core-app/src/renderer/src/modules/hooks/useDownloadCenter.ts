import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getTouchSDK } from '@talex-touch/utils/renderer'
import { DownloadRequest, DownloadTask, DownloadStatus, DownloadPriority } from '@talex-touch/utils'

/**
 * Download center composable for managing download tasks
 * @returns Download center management utilities
 */
export function useDownloadCenter() {
  const downloadTasks = ref<DownloadTask[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const touchSDK = getTouchSDK()

  /**
   * Add a new download task
   * @param request - Download request configuration
   * @returns Promise that resolves to the task ID
   */
  const addDownloadTask = async (request: DownloadRequest): Promise<string> => {
    try {
      loading.value = true
      error.value = null

      const response = await touchSDK.rawChannel.send('download:add-task', request)

      if (response.success) {
        return response.taskId
      } else {
        throw new Error(response.error || 'Failed to add download task')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Pause a download task
   * @param taskId - The task ID to pause
   * @returns Promise that resolves when task is paused
   */
  const pauseTask = async (taskId: string): Promise<void> => {
    try {
      const response = await touchSDK.rawChannel.send('download:pause-task', taskId)

      if (!response.success) {
        throw new Error(response.error || 'Failed to pause task')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    }
  }

  /**
   * Resume a paused download task
   * @param taskId - The task ID to resume
   * @returns Promise that resolves when task is resumed
   */
  const resumeTask = async (taskId: string): Promise<void> => {
    try {
      const response = await touchSDK.rawChannel.send('download:resume-task', taskId)

      if (!response.success) {
        throw new Error(response.error || 'Failed to resume task')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    }
  }

  /**
   * Cancel a download task
   * @param taskId - The task ID to cancel
   * @returns Promise that resolves when task is cancelled
   */
  const cancelTask = async (taskId: string): Promise<void> => {
    try {
      const response = await touchSDK.rawChannel.send('download:cancel-task', taskId)

      if (!response.success) {
        throw new Error(response.error || 'Failed to cancel task')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    }
  }

  /**
   * Get all download tasks
   * @returns Promise that resolves to array of download tasks
   */
  const getAllTasks = async (): Promise<DownloadTask[]> => {
    try {
      const response = await touchSDK.rawChannel.send('download:get-tasks')

      if (response.success) {
        downloadTasks.value = response.tasks
        return response.tasks
      } else {
        throw new Error(response.error || 'Failed to get tasks')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    }
  }

  /**
   * Get status of a specific download task
   * @param taskId - The task ID to get status for
   * @returns Promise that resolves to task or null if not found
   */
  const getTaskStatus = async (taskId: string): Promise<DownloadTask | null> => {
    try {
      const response = await touchSDK.rawChannel.send('download:get-task-status', taskId)

      if (response.success) {
        return response.task
      } else {
        throw new Error(response.error || 'Failed to get task status')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    }
  }

  /**
   * Update download center configuration
   * @param config - Configuration object to update
   * @returns Promise that resolves when config is updated
   */
  const updateConfig = async (config: any): Promise<void> => {
    try {
      const response = await touchSDK.rawChannel.send('download:update-config', config)

      if (!response.success) {
        throw new Error(response.error || 'Failed to update config')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    }
  }

  /**
   * Update a task in the tasks list
   * @param task - The task to update
   */
  const updateTaskInList = (task: DownloadTask): void => {
    const index = downloadTasks.value.findIndex((t) => t.id === task.id)
    if (index !== -1) {
      downloadTasks.value[index] = task
    } else {
      downloadTasks.value.push(task)
    }
  }

  /**
   * Setup IPC event listeners for download events
   */
  const setupEventListeners = (): void => {
    // 任务添加事件
    touchSDK.onChannelEvent('download:task-added', (task: DownloadTask) => {
      updateTaskInList(task)
    })

    // 任务进度更新事件
    touchSDK.onChannelEvent('download:task-progress', (task: DownloadTask) => {
      updateTaskInList(task)
    })

    // 任务完成事件
    touchSDK.onChannelEvent('download:task-completed', (task: DownloadTask) => {
      updateTaskInList(task)
    })

    // 任务失败事件
    touchSDK.onChannelEvent('download:task-failed', (task: DownloadTask) => {
      updateTaskInList(task)
    })

    // 任务更新事件
    touchSDK.onChannelEvent('download:task-updated', (task: DownloadTask) => {
      updateTaskInList(task)
    })
  }

  /**
   * Computed task statistics
   */
  const taskStats = computed(() => {
    const tasks = downloadTasks.value
    return {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === DownloadStatus.PENDING).length,
      downloading: tasks.filter((t) => t.status === DownloadStatus.DOWNLOADING).length,
      completed: tasks.filter((t) => t.status === DownloadStatus.COMPLETED).length,
      failed: tasks.filter((t) => t.status === DownloadStatus.FAILED).length,
      paused: tasks.filter((t) => t.status === DownloadStatus.PAUSED).length,
      cancelled: tasks.filter((t) => t.status === DownloadStatus.CANCELLED).length
    }
  })

  /**
   * Computed tasks grouped by status
   */
  const tasksByStatus = computed(() => {
    const tasks = downloadTasks.value
    return {
      pending: tasks.filter((t) => t.status === DownloadStatus.PENDING),
      downloading: tasks.filter((t) => t.status === DownloadStatus.DOWNLOADING),
      completed: tasks.filter((t) => t.status === DownloadStatus.COMPLETED),
      failed: tasks.filter((t) => t.status === DownloadStatus.FAILED),
      paused: tasks.filter((t) => t.status === DownloadStatus.PAUSED),
      cancelled: tasks.filter((t) => t.status === DownloadStatus.CANCELLED)
    }
  })

  /**
   * Computed high priority tasks
   */
  const highPriorityTasks = computed(() => {
    return downloadTasks.value.filter((t) => t.priority >= DownloadPriority.HIGH)
  })

  /**
   * Computed current download speed
   */
  const currentDownloadSpeed = computed(() => {
    const downloadingTasks = tasksByStatus.value.downloading
    return downloadingTasks.reduce((total, task) => total + (task.progress?.speed || 0), 0)
  })

  /**
   * Format bytes per second to human readable speed
   * @param bytesPerSecond - Speed in bytes per second
   * @returns Formatted speed string
   */
  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond >= 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
    } else if (bytesPerSecond >= 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
    } else {
      return `${bytesPerSecond.toFixed(0)} B/s`
    }
  }

  /**
   * Format bytes to human readable size
   * @param bytes - Size in bytes
   * @returns Formatted size string
   */
  const formatSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    } else if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    } else {
      return `${bytes.toFixed(0)} B`
    }
  }

  /**
   * Format seconds to human readable remaining time
   * @param seconds - Time in seconds
   * @returns Formatted time string
   */
  const formatRemainingTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)}秒`
    } else if (seconds < 3600) {
      const minutes = Math.round(seconds / 60)
      return `${minutes}分钟`
    } else {
      const hours = Math.round(seconds / 3600)
      return `${hours}小时`
    }
  }

  /**
   * Get color for download task status
   * @param status - Download status
   * @returns Color string for the status
   */
  const getTaskStatusColor = (status: DownloadStatus): string => {
    switch (status) {
      case DownloadStatus.DOWNLOADING:
        return '#409EFF'
      case DownloadStatus.COMPLETED:
        return '#67C23A'
      case DownloadStatus.FAILED:
        return '#F56C6C'
      case DownloadStatus.PAUSED:
        return '#E6A23C'
      case DownloadStatus.CANCELLED:
        return '#909399'
      default:
        return '#909399'
    }
  }

  /**
   * Get icon for download task status
   * @param status - Download status
   * @returns Icon name for the status
   */
  const getTaskStatusIcon = (status: DownloadStatus): string => {
    switch (status) {
      case DownloadStatus.DOWNLOADING:
        return 'loading'
      case DownloadStatus.COMPLETED:
        return 'check'
      case DownloadStatus.FAILED:
        return 'close'
      case DownloadStatus.PAUSED:
        return 'pause'
      case DownloadStatus.CANCELLED:
        return 'remove'
      default:
        return 'clock'
    }
  }

  /**
   * Initialize download center
   */
  onMounted(async () => {
    setupEventListeners()
    await getAllTasks()
  })

  /**
   * Cleanup download center
   */
  onUnmounted(() => {
    // Cleanup event listeners
  })

  return {
    // State
    downloadTasks,
    loading,
    error,
    taskStats,
    tasksByStatus,
    highPriorityTasks,
    currentDownloadSpeed,

    // Methods
    addDownloadTask,
    pauseTask,
    resumeTask,
    cancelTask,
    getAllTasks,
    getTaskStatus,
    updateConfig,

    // Utility methods
    formatSpeed,
    formatSize,
    formatRemainingTime,
    getTaskStatusColor,
    getTaskStatusIcon
  }
}
