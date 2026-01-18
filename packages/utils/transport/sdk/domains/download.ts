import type {
  DownloadAddTaskRequest,
  DownloadAddTaskResponse,
  DownloadClearHistoryItemRequest,
  DownloadGetConfigResponse,
  DownloadGetErrorStatsResponse,
  DownloadGetHistoryRequest,
  DownloadGetHistoryResponse,
  DownloadGetLogsResponse,
  DownloadGetNotificationConfigResponse,
  DownloadGetStatsResponse,
  DownloadGetTaskStatusResponse,
  DownloadGetTasksByStatusRequest,
  DownloadGetTasksResponse,
  DownloadGetTempStatsResponse,
  DownloadMigrationNeededResponse,
  DownloadMigrationRetryResponse,
  DownloadMigrationStartResponse,
  DownloadMigrationStatusResponse,
  DownloadNotificationClickedPayload,
  DownloadOpResponse,
  DownloadTaskIdRequest,
  DownloadTaskPayload,
  DownloadTaskRetryingPayload,
  DownloadUpdateConfigRequest,
  DownloadUpdateNotificationConfigRequest,
  DownloadUpdatePriorityRequest,
} from '../../events/types'
import type { ITuffTransport } from '../../types'
import { DownloadEvents } from '../../events'

export interface DownloadSdk {
  addTask: (request: DownloadAddTaskRequest) => Promise<DownloadAddTaskResponse>
  pauseTask: (payload: DownloadTaskIdRequest) => Promise<DownloadOpResponse>
  resumeTask: (payload: DownloadTaskIdRequest) => Promise<DownloadOpResponse>
  cancelTask: (payload: DownloadTaskIdRequest) => Promise<DownloadOpResponse>
  retryTask: (payload: DownloadTaskIdRequest) => Promise<DownloadOpResponse>
  removeTask: (payload: DownloadTaskIdRequest) => Promise<DownloadOpResponse>
  updatePriority: (payload: DownloadUpdatePriorityRequest) => Promise<DownloadOpResponse>
  pauseAll: () => Promise<DownloadOpResponse>
  resumeAll: () => Promise<DownloadOpResponse>
  cancelAll: () => Promise<DownloadOpResponse>

  getAllTasks: () => Promise<DownloadGetTasksResponse>
  getTasksByStatus: (payload: DownloadGetTasksByStatusRequest) => Promise<DownloadGetTasksResponse>
  getTaskStatus: (payload: DownloadTaskIdRequest) => Promise<DownloadGetTaskStatusResponse>

  getConfig: () => Promise<DownloadGetConfigResponse>
  updateConfig: (payload: DownloadUpdateConfigRequest) => Promise<DownloadOpResponse>
  getNotificationConfig: () => Promise<DownloadGetNotificationConfigResponse>
  updateNotificationConfig: (
    payload: DownloadUpdateNotificationConfigRequest
  ) => Promise<DownloadOpResponse>

  getHistory: (payload?: DownloadGetHistoryRequest) => Promise<DownloadGetHistoryResponse>
  clearHistory: () => Promise<DownloadOpResponse>
  clearHistoryItem: (payload: DownloadClearHistoryItemRequest) => Promise<DownloadOpResponse>

  openFile: (payload: DownloadTaskIdRequest) => Promise<DownloadOpResponse>
  showInFolder: (payload: DownloadTaskIdRequest) => Promise<DownloadOpResponse>
  deleteFile: (payload: DownloadTaskIdRequest) => Promise<DownloadOpResponse>

  cleanupTemp: () => Promise<DownloadOpResponse>
  getTempStats: () => Promise<DownloadGetTempStatsResponse>

  getLogs: (payload?: { limit?: number }) => Promise<DownloadGetLogsResponse>
  getErrorStats: () => Promise<DownloadGetErrorStatsResponse>
  clearLogs: () => Promise<DownloadOpResponse>

  getStats: () => Promise<DownloadGetStatsResponse>

  checkMigrationNeeded: () => Promise<DownloadMigrationNeededResponse>
  startMigration: () => Promise<DownloadMigrationStartResponse>
  retryMigration: () => Promise<DownloadMigrationRetryResponse>
  getMigrationStatus: () => Promise<DownloadMigrationStatusResponse>

  onTaskAdded: (handler: (task: DownloadTaskPayload) => void) => () => void
  onTaskProgress: (handler: (task: DownloadTaskPayload) => void) => () => void
  onTaskCompleted: (handler: (task: DownloadTaskPayload) => void) => () => void
  onTaskFailed: (handler: (task: DownloadTaskPayload) => void) => () => void
  onTaskUpdated: (handler: (task: DownloadTaskPayload) => void) => () => void
  onTaskRetrying: (handler: (payload: DownloadTaskRetryingPayload) => void) => () => void
  onNotificationClicked: (handler: (payload: DownloadNotificationClickedPayload) => void) => () => void
}

export function createDownloadSdk(transport: ITuffTransport): DownloadSdk {
  return {
    addTask: request => transport.send(DownloadEvents.task.add, request),
    pauseTask: payload => transport.send(DownloadEvents.task.pause, payload),
    resumeTask: payload => transport.send(DownloadEvents.task.resume, payload),
    cancelTask: payload => transport.send(DownloadEvents.task.cancel, payload),
    retryTask: payload => transport.send(DownloadEvents.task.retry, payload),
    removeTask: payload => transport.send(DownloadEvents.task.remove, payload),
    updatePriority: payload => transport.send(DownloadEvents.task.updatePriority, payload),
    pauseAll: () => transport.send(DownloadEvents.task.pauseAll),
    resumeAll: () => transport.send(DownloadEvents.task.resumeAll),
    cancelAll: () => transport.send(DownloadEvents.task.cancelAll),

    getAllTasks: () => transport.send(DownloadEvents.list.getAll),
    getTasksByStatus: payload => transport.send(DownloadEvents.list.getByStatus, payload),
    getTaskStatus: payload => transport.send(DownloadEvents.task.getStatus, payload),

    getConfig: () => transport.send(DownloadEvents.config.get),
    updateConfig: payload => transport.send(DownloadEvents.config.update, payload),
    getNotificationConfig: () => transport.send(DownloadEvents.config.getNotification),
    updateNotificationConfig: payload =>
      transport.send(DownloadEvents.config.updateNotification, payload),

    getHistory: payload => transport.send(DownloadEvents.history.get, payload ?? {}),
    clearHistory: () => transport.send(DownloadEvents.history.clear),
    clearHistoryItem: payload => transport.send(DownloadEvents.history.clearItem, payload),

    openFile: payload => transport.send(DownloadEvents.file.open, payload),
    showInFolder: payload => transport.send(DownloadEvents.file.showInFolder, payload),
    deleteFile: payload => transport.send(DownloadEvents.file.delete, payload),

    cleanupTemp: () => transport.send(DownloadEvents.maintenance.cleanupTemp),
    getTempStats: () => transport.send(DownloadEvents.temp.getStats),

    getLogs: payload => transport.send(DownloadEvents.logs.get, payload ?? {}),
    getErrorStats: () => transport.send(DownloadEvents.logs.getErrorStats),
    clearLogs: () => transport.send(DownloadEvents.logs.clear),

    getStats: () => transport.send(DownloadEvents.stats.get),

    checkMigrationNeeded: () => transport.send(DownloadEvents.migration.checkNeeded),
    startMigration: () => transport.send(DownloadEvents.migration.start),
    retryMigration: () => transport.send(DownloadEvents.migration.retry),
    getMigrationStatus: () => transport.send(DownloadEvents.migration.status),

    onTaskAdded: handler => transport.on(DownloadEvents.push.taskAdded, handler),
    onTaskProgress: handler => transport.on(DownloadEvents.push.taskProgress, handler),
    onTaskCompleted: handler => transport.on(DownloadEvents.push.taskCompleted, handler),
    onTaskFailed: handler => transport.on(DownloadEvents.push.taskFailed, handler),
    onTaskUpdated: handler => transport.on(DownloadEvents.push.taskUpdated, handler),
    onTaskRetrying: handler => transport.on(DownloadEvents.push.taskRetrying, handler),
    onNotificationClicked: handler => transport.on(DownloadEvents.push.notificationClicked, handler),
  }
}
