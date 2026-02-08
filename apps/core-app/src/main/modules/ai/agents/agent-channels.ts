/**
 * Agent IPC Channels
 *
 * Handles communication between renderer and main process for agents.
 */

import type { AgentDescriptor, AgentResult, AgentTool } from '@talex-touch/utils'
import type {
  AgentsMarketInstallRequest,
  AgentsMarketSearchRequest
} from '@talex-touch/utils/transport/events/types'
import {
  AgentsEvents,
  getTuffTransportMain,
  type TuffEvent
} from '@talex-touch/utils/transport/main'
import { genTouchApp } from '../../../core'
import { agentMarketService } from '../../../service/agent-market.service'
import { createLogger } from '../../../utils/logger'
import { agentManager } from './agent-manager'

const agentChannelsLog = createLogger('Intelligence').child('AgentChannels')
const formatLogArgs = (args: unknown[]): string => args.map((arg) => String(arg)).join(' ')
const logInfo = (...args: unknown[]) => agentChannelsLog.info(formatLogArgs(args))

/**
 * Register all agent IPC channels
 */
export function registerAgentChannels(): () => void {
  const channel = genTouchApp().channel
  const keyManager = (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
  const transport = getTuffTransportMain(channel, keyManager)
  const cleanups: Array<() => void> = []

  // ============================================================================
  // Agent Management
  // ============================================================================

  // List all available agents
  cleanups.push(
    transport.on(AgentsEvents.api.list, async (): Promise<AgentDescriptor[]> => {
      return agentManager.getAvailableAgents()
    })
  )

  // List all agents (including disabled)
  cleanups.push(
    transport.on(AgentsEvents.api.listAll, async (): Promise<AgentDescriptor[]> => {
      return agentManager.getAllAgents()
    })
  )

  // Get specific agent
  cleanups.push(
    transport.on(AgentsEvents.api.get, async (payload): Promise<AgentDescriptor | null> => {
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
    transport.on(AgentsEvents.api.execute, async (payload): Promise<{ taskId: string }> => {
      const taskId = await agentManager.executeTask(payload)
      return { taskId }
    })
  )

  // Execute a task immediately
  cleanups.push(
    transport.on(AgentsEvents.api.executeImmediate, async (payload): Promise<AgentResult> => {
      return agentManager.executeTaskImmediate(payload)
    })
  )

  // Cancel a task
  cleanups.push(
    transport.on(AgentsEvents.api.cancel, async (payload): Promise<{ success: boolean }> => {
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
      return agentManager.getTools()
    })
  )

  // Get specific tool
  cleanups.push(
    transport.on(AgentsEvents.api.tools.get, async (payload): Promise<AgentTool | null> => {
      return agentManager.getTool(payload?.toolId)
    })
  )

  // ============================================================================
  // Statistics
  // ============================================================================

  // Get agent system stats
  cleanups.push(
    transport.on(AgentsEvents.api.stats, async () => {
      return agentManager.getStats()
    })
  )

  // ============================================================================
  // Agent Market
  // ============================================================================

  // Search agents in market
  cleanups.push(
    transport.on(AgentsEvents.market.search, async (payload) => {
      const options: AgentsMarketSearchRequest = payload ?? {}
      return agentMarketService.searchAgents(options)
    })
  )

  // Get agent details
  cleanups.push(
    transport.on(AgentsEvents.market.get, async (payload) => {
      const agentId = payload?.agentId
      if (!agentId) {
        return null
      }
      return agentMarketService.getAgentDetails(agentId)
    })
  )

  // Get featured agents
  cleanups.push(
    transport.on(AgentsEvents.market.featured, async () => {
      return agentMarketService.getFeaturedAgents()
    })
  )

  // Get installed agents
  cleanups.push(
    transport.on(AgentsEvents.market.installed, async () => {
      return agentMarketService.getInstalledAgents()
    })
  )

  // Get categories
  cleanups.push(
    transport.on(AgentsEvents.market.categories, async () => {
      return agentMarketService.getCategories()
    })
  )

  // Install agent
  cleanups.push(
    transport.on(AgentsEvents.market.install, async (payload) => {
      const options: AgentsMarketInstallRequest | undefined = payload
      if (!options?.agentId) {
        return {
          success: false,
          agentId: '',
          version: 'unknown',
          error: 'agentId is required'
        }
      }
      return agentMarketService.installAgent(options)
    })
  )

  // Uninstall agent
  cleanups.push(
    transport.on(AgentsEvents.market.uninstall, async (payload) => {
      const agentId = payload?.agentId
      if (!agentId) {
        return {
          success: false,
          agentId: '',
          version: 'unknown',
          error: 'agentId is required'
        }
      }
      return agentMarketService.uninstallAgent(agentId)
    })
  )

  // Check for updates
  cleanups.push(
    transport.on(AgentsEvents.market.checkUpdates, async () => {
      return agentMarketService.checkUpdates()
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
