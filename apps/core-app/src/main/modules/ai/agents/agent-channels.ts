/**
 * Agent IPC Channels
 *
 * Handles communication between renderer and main process for agents.
 */

import type { AgentDescriptor, AgentResult, AgentTask, AgentTool } from '@talex-touch/utils'
import { ChannelType } from '@talex-touch/utils/channel'
import { genTouchChannel } from '../../../core/channel-core'
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
  const channel = genTouchChannel()
  const cleanups: Array<() => void> = []

  // ============================================================================
  // Agent Management
  // ============================================================================

  // List all available agents
  cleanups.push(
    channel.regChannel(ChannelType.MAIN, 'agents:list', async (): Promise<AgentDescriptor[]> => {
      return agentManager.getAvailableAgents()
    })
  )

  // List all agents (including disabled)
  cleanups.push(
    channel.regChannel(
      ChannelType.MAIN,
      'agents:list-all',
      async (): Promise<AgentDescriptor[]> => {
        return agentManager.getAllAgents()
      }
    )
  )

  // Get specific agent
  cleanups.push(
    channel.regChannel(
      ChannelType.MAIN,
      'agents:get',
      async ({ data }): Promise<AgentDescriptor | null> => {
        return agentManager.getAgent(data?.agentId)
      }
    )
  )

  // ============================================================================
  // Task Execution
  // ============================================================================

  // Execute a task (queued)
  cleanups.push(
    channel.regChannel(
      ChannelType.MAIN,
      'agents:execute',
      async ({ data }): Promise<{ taskId: string }> => {
        const taskId = await agentManager.executeTask(data as AgentTask)
        return { taskId }
      }
    )
  )

  // Execute a task immediately
  cleanups.push(
    channel.regChannel(
      ChannelType.MAIN,
      'agents:execute-immediate',
      async ({ data }): Promise<AgentResult> => {
        return agentManager.executeTaskImmediate(data as AgentTask)
      }
    )
  )

  // Cancel a task
  cleanups.push(
    channel.regChannel(
      ChannelType.MAIN,
      'agents:cancel',
      async ({ data }): Promise<{ success: boolean }> => {
        const success = await agentManager.cancelTask(data?.taskId)
        return { success }
      }
    )
  )

  // Get task status
  cleanups.push(
    channel.regChannel(
      ChannelType.MAIN,
      'agents:task-status',
      async ({ data }): Promise<{ status: string }> => {
        const status = agentManager.getTaskStatus(data?.taskId)
        return { status }
      }
    )
  )

  // Update task priority
  cleanups.push(
    channel.regChannel(
      ChannelType.MAIN,
      'agents:update-priority',
      async ({ data }): Promise<{ success: boolean }> => {
        const success = agentManager.updateTaskPriority(data?.taskId, data?.priority)
        return { success }
      }
    )
  )

  // ============================================================================
  // Tool Management
  // ============================================================================

  // List all tools
  cleanups.push(
    channel.regChannel(ChannelType.MAIN, 'agents:tools:list', async (): Promise<AgentTool[]> => {
      return agentManager.getTools()
    })
  )

  // Get specific tool
  cleanups.push(
    channel.regChannel(
      ChannelType.MAIN,
      'agents:tools:get',
      async ({ data }): Promise<AgentTool | null> => {
        return agentManager.getTool(data?.toolId)
      }
    )
  )

  // ============================================================================
  // Statistics
  // ============================================================================

  // Get agent system stats
  cleanups.push(
    channel.regChannel(ChannelType.MAIN, 'agents:stats', async () => {
      return agentManager.getStats()
    })
  )

  // ============================================================================
  // Agent Market
  // ============================================================================

  // Search agents in market
  cleanups.push(
    channel.regChannel(ChannelType.MAIN, 'agents:market:search', async ({ data }) => {
      return agentMarketService.searchAgents(data || {})
    })
  )

  // Get agent details
  cleanups.push(
    channel.regChannel(ChannelType.MAIN, 'agents:market:get', async ({ data }) => {
      return agentMarketService.getAgentDetails(data?.agentId)
    })
  )

  // Get featured agents
  cleanups.push(
    channel.regChannel(ChannelType.MAIN, 'agents:market:featured', async () => {
      return agentMarketService.getFeaturedAgents()
    })
  )

  // Get installed agents
  cleanups.push(
    channel.regChannel(ChannelType.MAIN, 'agents:market:installed', async () => {
      return agentMarketService.getInstalledAgents()
    })
  )

  // Get categories
  cleanups.push(
    channel.regChannel(ChannelType.MAIN, 'agents:market:categories', async () => {
      return agentMarketService.getCategories()
    })
  )

  // Install agent
  cleanups.push(
    channel.regChannel(ChannelType.MAIN, 'agents:market:install', async ({ data }) => {
      return agentMarketService.installAgent(data)
    })
  )

  // Uninstall agent
  cleanups.push(
    channel.regChannel(ChannelType.MAIN, 'agents:market:uninstall', async ({ data }) => {
      return agentMarketService.uninstallAgent(data?.agentId)
    })
  )

  // Check for updates
  cleanups.push(
    channel.regChannel(ChannelType.MAIN, 'agents:market:check-updates', async () => {
      return agentMarketService.checkUpdates()
    })
  )

  // ============================================================================
  // Event Broadcasting
  // ============================================================================

  // Forward agent events to renderer
  const eventHandler = (eventName: string) => (data: unknown) => {
    channel.sendMain(`agents:${eventName}`, data)
  }

  agentManager.on('task:started', eventHandler('task-started'))
  agentManager.on('task:progress', eventHandler('task-progress'))
  agentManager.on('task:completed', eventHandler('task-completed'))
  agentManager.on('task:failed', eventHandler('task-failed'))
  agentManager.on('task:cancelled', eventHandler('task-cancelled'))

  logInfo('Registered agent IPC channels')

  // Return cleanup function
  return () => {
    cleanups.forEach((cleanup) => cleanup())
    agentManager.removeAllListeners()
    logInfo('Unregistered agent IPC channels')
  }
}
