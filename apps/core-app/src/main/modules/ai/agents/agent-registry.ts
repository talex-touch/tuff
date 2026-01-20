/**
 * Agent Registry
 *
 * Manages the registration and discovery of agents in the system.
 */

import type { AgentCapability, AgentConfig, AgentDescriptor } from '@talex-touch/utils'
import { createLogger } from '../../../utils/logger'

const agentRegistryLog = createLogger('Intelligence').child('AgentRegistry')
const formatLogArgs = (args: unknown[]): string => args.map((arg) => String(arg)).join(' ')
const logInfo = (...args: unknown[]) => agentRegistryLog.info(formatLogArgs(args))
const logWarn = (...args: unknown[]) => agentRegistryLog.warn(formatLogArgs(args))
const logDebug = (...args: unknown[]) => agentRegistryLog.debug(formatLogArgs(args))

/**
 * Agent implementation interface
 */
export interface AgentImpl {
  /**
   * Execute an agent task
   */
  execute: (input: unknown, context: AgentExecutionContext) => Promise<unknown>

  /**
   * Optional: Generate execution plan
   */
  plan?: (input: unknown, context: AgentExecutionContext) => Promise<unknown>

  /**
   * Optional: Handle chat interaction
   */
  chat?: (messages: unknown[], context: AgentExecutionContext) => AsyncGenerator<string>

  /**
   * Optional: Initialize the agent
   */
  init?: () => Promise<void>

  /**
   * Optional: Cleanup resources
   */
  destroy?: () => Promise<void>
}

/**
 * Agent execution context
 */
export interface AgentExecutionContext {
  taskId: string
  sessionId?: string
  workingDirectory?: string
  signal?: AbortSignal
  metadata?: Record<string, unknown>
}

/**
 * Registered agent entry
 */
interface RegisteredAgent {
  descriptor: AgentDescriptor
  impl: AgentImpl
  registeredAt: number
}

/**
 * Agent Registry - manages agent registration and discovery
 */
export class AgentRegistry {
  private agents: Map<string, RegisteredAgent> = new Map()

  /**
   * Register a new agent
   */
  registerAgent(descriptor: AgentDescriptor, impl: AgentImpl): void {
    if (this.agents.has(descriptor.id)) {
      logWarn(`Agent ${descriptor.id} already registered, replacing`)
    }

    this.agents.set(descriptor.id, {
      descriptor,
      impl,
      registeredAt: Date.now()
    })

    logInfo(`Registered agent: ${descriptor.id} (${descriptor.name})`)
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) {
      logWarn(`Agent ${agentId} not found`)
      return false
    }

    // Call destroy if available
    if (agent.impl.destroy) {
      agent.impl.destroy().catch((err) => {
        logWarn(`Error destroying agent ${agentId}: ${err}`)
      })
    }

    this.agents.delete(agentId)
    logInfo(`Unregistered agent: ${agentId}`)
    return true
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): RegisteredAgent | null {
    return this.agents.get(agentId) || null
  }

  /**
   * Get agent descriptor by ID
   */
  getDescriptor(agentId: string): AgentDescriptor | null {
    const agent = this.agents.get(agentId)
    return agent?.descriptor || null
  }

  /**
   * Get agent implementation by ID
   */
  getImpl(agentId: string): AgentImpl | null {
    const agent = this.agents.get(agentId)
    return agent?.impl || null
  }

  /**
   * Get all registered agent descriptors
   */
  getAllDescriptors(): AgentDescriptor[] {
    return Array.from(this.agents.values()).map((a) => a.descriptor)
  }

  /**
   * Get enabled agents only
   */
  getEnabledAgents(): AgentDescriptor[] {
    return this.getAllDescriptors().filter((a) => a.enabled !== false)
  }

  /**
   * Get agents by category
   */
  getAgentsByCategory(category: string): AgentDescriptor[] {
    return this.getAllDescriptors().filter((a) => a.category === category)
  }

  /**
   * Find agents with a specific capability
   */
  findAgentsWithCapability(capabilityType: AgentCapability['type']): AgentDescriptor[] {
    return this.getAllDescriptors().filter((a) =>
      a.capabilities.some((c) => c.type === capabilityType)
    )
  }

  /**
   * Check if an agent is registered
   */
  hasAgent(agentId: string): boolean {
    return this.agents.has(agentId)
  }

  /**
   * Update agent configuration
   */
  updateAgentConfig(agentId: string, config: Partial<AgentConfig>): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) {
      logWarn(`Agent ${agentId} not found`)
      return false
    }

    agent.descriptor.config = {
      ...agent.descriptor.config,
      ...config
    }

    logDebug(`Updated config for agent ${agentId}`)
    return true
  }

  /**
   * Enable/disable an agent
   */
  setAgentEnabled(agentId: string, enabled: boolean): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) {
      return false
    }

    agent.descriptor.enabled = enabled
    logInfo(`Agent ${agentId} ${enabled ? 'enabled' : 'disabled'}`)
    return true
  }

  /**
   * Get registry statistics
   */
  getStats(): { total: number; enabled: number; byCategory: Record<string, number> } {
    const all = this.getAllDescriptors()
    const byCategory: Record<string, number> = {}

    for (const agent of all) {
      const cat = agent.category || 'custom'
      byCategory[cat] = (byCategory[cat] || 0) + 1
    }

    return {
      total: all.length,
      enabled: all.filter((a) => a.enabled !== false).length,
      byCategory
    }
  }

  /**
   * Clear all registered agents
   */
  clear(): void {
    for (const [id, agent] of this.agents) {
      if (agent.impl.destroy) {
        agent.impl.destroy().catch((err) => {
          logWarn(`Error destroying agent ${id}: ${err}`)
        })
      }
    }

    this.agents.clear()
    logInfo('Cleared all agents')
  }
}

// Singleton instance
export const agentRegistry = new AgentRegistry()
