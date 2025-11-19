export type PluginInstallTaskStage
  = | 'queued'
    | 'downloading'
    | 'awaiting-confirmation'
    | 'installing'
    | 'completed'
    | 'failed'
    | 'cancelled'

export interface PluginInstallProgressEvent {
  taskId: string
  stage: PluginInstallTaskStage
  progress?: number
  message?: string
  error?: string
  /** 安装源标识，例如下载 URL。 */
  source?: string
  /** 官方插件标记。 */
  official?: boolean
  /** 插件唯一标识或名称（由客户端提供）。 */
  pluginId?: string
  pluginName?: string
  /** 队列中的剩余任务数量（包含当前任务）。 */
  remaining?: number
  /** 当前任务在队列中的位置（0 表示正在处理）。 */
  position?: number
}

export interface PluginInstallConfirmRequest {
  taskId: string
  pluginName?: string
  pluginId?: string
  source?: string
  official?: boolean
}

export type PluginInstallConfirmDecision = 'accept' | 'reject'

export interface PluginInstallConfirmResponse {
  taskId: string
  decision: PluginInstallConfirmDecision
  reason?: string
}
