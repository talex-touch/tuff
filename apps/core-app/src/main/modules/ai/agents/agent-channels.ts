/**
 * Agent IPC Channels
 *
 * Handles communication between renderer and main process for agents.
 */

import type { AgentDescriptor, AgentResult, AgentTask, AgentTool } from '@talex-touch/utils'
import type {
  AgentsStoreInstallRequest,
  AgentsStoreSearchRequest
} from '@talex-touch/utils/transport/events/types'
import {
  AgentsEvents,
  type ITuffTransportMain,
  type HandlerContext,
  type TuffEvent
} from '@talex-touch/utils/transport/main'
import { agentStoreService } from '../../../service/agent-store.service'
import { createLogger } from '../../../utils/logger'
import { withPermission } from '../../permission/channel-guard'
import { agentManager } from './agent-manager'

const agentChannelsLog = createLogger('Intelligence').child('AgentChannels')
const formatLogArgs = (args: unknown[]): string => args.map((arg) => String(arg)).join(' ')
const logInfo = (...args: unknown[]) => agentChannelsLog.info(formatLogArgs(args))
const DEFAULT_AGENT_CALLER = 'intelligence.agent-executor'
const AGENT_EXECUTION_PERMISSION = {
  permissionId: 'intelligence.agents',
  failClosedForPlugin: true,
  unavailableCode: 'INTELLIGENCE_AGENTS_PERMISSION_UNAVAILABLE',
  deniedCode: 'INTELLIGENCE_AGENTS_PERMISSION_DENIED'
} as const

function bindAgentTaskCaller(task: AgentTask, context: HandlerContext): AgentTask {
  const caller = context.plugin
    ? `plugin:${context.plugin.name}`
    : task.caller?.trim() || DEFAULT_AGENT_CALLER
  return task.caller === caller ? task : { ...task, caller }
}

interface AgentChannelOptions {
  waitForRuntime?: () => Promise<void>
}

/**
 * Register all agent IPC channels
 */
export function registerAgentChannels(
  transport: ITuffTransportMain,
  options: AgentChannelOptions = {}
): () => void {
  const cleanups: Array<() => void> = []
  const waitForRuntime = async () => {
    await options.waitForRuntime?.()
  }

  // ============================================================================
  // Agent Management
  // ============================================================================

  // List all available agents
  cleanups.push(
    transport.on(AgentsEvents.api.list, async (): Promise<AgentDescriptor[]> => {
      await waitForRuntime()
      return agentManager.getAvailableAgents()
    })
  )

  // List all agents (including disabled)
  cleanups.push(
    transport.on(AgentsEvents.api.listAll, async (): Promise<AgentDescriptor[]> => {
      await waitForRuntime()
      return agentManager.getAllAgents()
    })
  )

  // Get specific agent
  cleanups.push(
    transport.on(AgentsEvents.api.get, async (payload): Promise<AgentDescriptor | null> => {
      await waitForRuntime()
      const agentId = payload?.id
      if (!agentId) {
        return null
      }
      return agentManager.getAgent(agentId)
    })
  )

  // ============================================================================
  // Task Execution
  // ============================================================================

  // Execute a task (queued)
  cleanups.push(
    transport.on(
      AgentsEvents.api.execute,
      withPermission<AgentTask, { taskId: string }>(
        AGENT_EXECUTION_PERMISSION,
        async (payload, context): Promise<{ taskId: string }> => {
          await waitForRuntime()
          const taskId = await agentManager.executeTask(bindAgentTaskCaller(payload, context))
          return { taskId }
        }
      )
    )
  )

  // Execute a task immediately
  cleanups.push(
    transport.on(
      AgentsEvents.api.executeImmediate,
      withPermission<AgentTask, AgentResult>(
        AGENT_EXECUTION_PERMISSION,
        async (payload, context): Promise<AgentResult> => {
          await waitForRuntime()
          return agentManager.executeTaskImmediate(bindAgentTaskCaller(payload, context))
        }
      )
    )
  )

  // Cancel a task
  cleanups.push(
    transport.on(AgentsEvents.api.cancel, async (payload): Promise<{ success: boolean }> => {
      await waitForRuntime()
      if (!payload?.taskId) {
        return { success: false }
      }
      const success = await agentManager.cancelTask(payload.taskId)
      return { success }
    })
  )

  // Get task status
  cleanups.push(
    transport.on(AgentsEvents.api.taskStatus, async (payload): Promise<{ status: string }> => {
      await waitForRuntime()
      if (!payload?.taskId) {
        return { status: 'idle' }
      }
      const status = agentManager.getTaskStatus(payload.taskId)
      return { status }
    })
  )

  // Update task priority
  cleanups.push(
    transport.on(
      AgentsEvents.api.updatePriority,
      async (payload): Promise<{ success: boolean }> => {
        await waitForRuntime()
        if (!payload?.taskId || typeof payload.priority !== 'number') {
          return { success: false }
        }
        const success = agentManager.updateTaskPriority(payload.taskId, payload.priority)
        return { success }
      }
    )
  )

  // ============================================================================
  // Tool Management
  // ============================================================================

  // List all tools
  cleanups.push(
    transport.on(AgentsEvents.api.tools.list, async (): Promise<AgentTool[]> => {
      await waitForRuntime()
      return agentManager.getTools()
    })
  )

  // Get specific tool
  cleanups.push(
    transport.on(AgentsEvents.api.tools.get, async (payload): Promise<AgentTool | null> => {
      await waitForRuntime()
      return agentManager.getTool(payload?.toolId)
    })
  )

  // ============================================================================
  // Statistics
  // ============================================================================

  // Get agent system stats
  cleanups.push(
    transport.on(AgentsEvents.api.stats, async () => {
      await waitForRuntime()
      return agentManager.getStats()
    })
  )

  // ============================================================================
  // Agent Store
  // ============================================================================

  // Search agents in store
  cleanups.push(
    transport.on(AgentsEvents.store.search, async (payload) => {
      const options: AgentsStoreSearchRequest = payload ?? {}
      return agentStoreService.searchAgents(options)
    })
  )

  // Get agent details
  cleanups.push(
    transport.on(AgentsEvents.store.get, async (payload) => {
      const agentId = payload?.agentId
      if (!agentId) {
        return null
      }
      return agentStoreService.getAgentDetails(agentId)
    })
  )

  // Get featured agents
  cleanups.push(
    transport.on(AgentsEvents.store.featured, async () => {
      return agentStoreService.getFeaturedAgents()
    })
  )

  // Get installed agents
  cleanups.push(
    transport.on(AgentsEvents.store.installed, async () => {
      return agentStoreService.getInstalledAgents()
    })
  )

  // Get categories
  cleanups.push(
    transport.on(AgentsEvents.store.categories, async () => {
      return agentStoreService.getCategories()
    })
  )

  // Install agent
  cleanups.push(
    transport.on(AgentsEvents.store.install, async (payload) => {
      const options: AgentsStoreInstallRequest | undefined = payload
      if (!options?.agentId) {
        return {
          success: false,
          agentId: '',
          version: 'unknown',
          error: 'agentId is required'
        }
      }
      return agentStoreService.installAgent(options)
    })
  )

  // Uninstall agent
  cleanups.push(
    transport.on(AgentsEvents.store.uninstall, async (payload) => {
      const agentId = payload?.agentId
      if (!agentId) {
        return {
          success: false,
          agentId: '',
          version: 'unknown',
          error: 'agentId is required'
        }
      }
      return agentStoreService.uninstallAgent(agentId)
    })
  )

  // Check for updates
  cleanups.push(
    transport.on(AgentsEvents.store.checkUpdates, async () => {
      return agentStoreService.checkUpdates()
    })
  )

  // ============================================================================
  // Event Broadcasting
  // ============================================================================

  // Forward agent events to renderer
  const eventHandler =
    <TReq>(event: TuffEvent<TReq, void>) =>
    (data: TReq) => {
      transport.broadcast(event, data)
    }

  agentManager.on('task:started', eventHandler(AgentsEvents.push.taskStarted))
  agentManager.on('task:progress', eventHandler(AgentsEvents.push.taskProgress))
  agentManager.on('task:completed', eventHandler(AgentsEvents.push.taskCompleted))
  agentManager.on('task:failed', eventHandler(AgentsEvents.push.taskFailed))
  agentManager.on('task:cancelled', eventHandler(AgentsEvents.push.taskCancelled))

  logInfo('Registered agent IPC channels')

  // Return cleanup function
  return () => {
    cleanups.forEach((cleanup) => cleanup())
    agentManager.removeAllListeners()
    logInfo('Unregistered agent IPC channels')
  }
}
