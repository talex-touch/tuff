import type {
  AgentsCancelResponse,
  AgentsExecuteImmediateRequest,
  AgentsExecuteImmediateResponse,
  AgentsExecuteRequest,
  AgentsExecuteResponse,
  AgentsGetResponse,
  AgentsListResponse,
  AgentsStatsResponse,
  AgentsTaskCancelledPayload,
  AgentsTaskCompletedPayload,
  AgentsTaskFailedPayload,
  AgentsTaskProgressPayload,
  AgentsTaskStartedPayload,
  AgentsTaskStatusResponse,
  AgentsToolsGetResponse,
  AgentsToolsListResponse,
  AgentsUpdatePriorityResponse,
} from '../../events/types'
import type { ITuffTransport } from '../../types'
import { AgentsEvents } from '../../events'

export interface AgentsSdk {
  list: () => Promise<AgentsListResponse>
  listAll: () => Promise<AgentsListResponse>
  get: (id: string) => Promise<AgentsGetResponse>
  execute: (task: AgentsExecuteRequest) => Promise<AgentsExecuteResponse>
  executeImmediate: (task: AgentsExecuteImmediateRequest) => Promise<AgentsExecuteImmediateResponse>
  cancel: (taskId: string) => Promise<AgentsCancelResponse>
  getTaskStatus: (taskId: string) => Promise<AgentsTaskStatusResponse>
  updatePriority: (taskId: string, priority: number) => Promise<AgentsUpdatePriorityResponse>
  getStats: () => Promise<AgentsStatsResponse>
  listTools: () => Promise<AgentsToolsListResponse>
  getTool: (toolId: string) => Promise<AgentsToolsGetResponse>
  onTaskStarted: (handler: (payload: AgentsTaskStartedPayload) => void) => () => void
  onTaskProgress: (handler: (payload: AgentsTaskProgressPayload) => void) => () => void
  onTaskCompleted: (handler: (payload: AgentsTaskCompletedPayload) => void) => () => void
  onTaskFailed: (handler: (payload: AgentsTaskFailedPayload) => void) => () => void
  onTaskCancelled: (handler: (payload: AgentsTaskCancelledPayload) => void) => () => void
}

export function createAgentsSdk(transport: ITuffTransport): AgentsSdk {
  return {
    list: () => transport.send(AgentsEvents.api.list),
    listAll: () => transport.send(AgentsEvents.api.listAll),
    get: id => transport.send(AgentsEvents.api.get, { id }),
    execute: task => transport.send(AgentsEvents.api.execute, task),
    executeImmediate: task => transport.send(AgentsEvents.api.executeImmediate, task),
    cancel: taskId => transport.send(AgentsEvents.api.cancel, { taskId }),
    getTaskStatus: taskId => transport.send(AgentsEvents.api.taskStatus, { taskId }),
    updatePriority: (taskId, priority) =>
      transport.send(AgentsEvents.api.updatePriority, { taskId, priority }),
    getStats: () => transport.send(AgentsEvents.api.stats),
    listTools: () => transport.send(AgentsEvents.api.tools.list),
    getTool: toolId => transport.send(AgentsEvents.api.tools.get, { toolId }),
    onTaskStarted: handler => transport.on(AgentsEvents.push.taskStarted, handler),
    onTaskProgress: handler => transport.on(AgentsEvents.push.taskProgress, handler),
    onTaskCompleted: handler => transport.on(AgentsEvents.push.taskCompleted, handler),
    onTaskFailed: handler => transport.on(AgentsEvents.push.taskFailed, handler),
    onTaskCancelled: handler => transport.on(AgentsEvents.push.taskCancelled, handler),
  }
}
