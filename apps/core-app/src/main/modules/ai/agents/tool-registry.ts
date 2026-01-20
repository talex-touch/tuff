/**
 * Tool Registry
 *
 * Manages agent tools that can be invoked during task execution.
 */

import type { AgentPermission, AgentTool, JsonSchema, ToolResult } from '@talex-touch/utils'
import { createLogger } from '../../../utils/logger'

const toolRegistryLog = createLogger('Intelligence').child('ToolRegistry')
const formatLogArgs = (args: unknown[]): string => args.map((arg) => String(arg)).join(' ')
const logInfo = (...args: unknown[]) => toolRegistryLog.info(formatLogArgs(args))
const logWarn = (...args: unknown[]) => toolRegistryLog.warn(formatLogArgs(args))
const logDebug = (...args: unknown[]) => toolRegistryLog.debug(formatLogArgs(args))

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
  taskId: string
  agentId: string
  workingDirectory?: string
  signal?: AbortSignal
}

/**
 * Tool executor function type
 */
export type ToolExecutorFn = (input: unknown, ctx: ToolExecutionContext) => Promise<unknown>

/**
 * Registered tool entry
 */
interface RegisteredTool {
  definition: AgentTool
  executor: ToolExecutorFn
  registeredAt: number
}

/**
 * Tool Registry - manages tool registration and execution
 */
export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map()

  /**
   * Register a new tool
   */
  registerTool(definition: AgentTool, executor: ToolExecutorFn): void {
    if (this.tools.has(definition.id)) {
      logWarn(`Tool ${definition.id} already registered, replacing`)
    }

    this.tools.set(definition.id, {
      definition,
      executor,
      registeredAt: Date.now()
    })

    logInfo(`Registered tool: ${definition.id} (${definition.name})`)
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolId: string): boolean {
    if (!this.tools.has(toolId)) {
      logWarn(`Tool ${toolId} not found`)
      return false
    }

    this.tools.delete(toolId)
    logInfo(`Unregistered tool: ${toolId}`)
    return true
  }

  /**
   * Get tool definition by ID
   */
  getTool(toolId: string): AgentTool | null {
    const tool = this.tools.get(toolId)
    return tool?.definition || null
  }

  /**
   * Get all tool definitions
   */
  getAllTools(): AgentTool[] {
    return Array.from(this.tools.values()).map((t) => t.definition)
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): AgentTool[] {
    return this.getAllTools().filter((t) => t.category === category)
  }

  /**
   * Get tools for a specific agent (by tool refs)
   */
  getToolsForAgent(toolIds: string[]): AgentTool[] {
    return toolIds.map((id) => this.getTool(id)).filter((t): t is AgentTool => t !== null)
  }

  /**
   * Check if a tool exists
   */
  hasTool(toolId: string): boolean {
    return this.tools.has(toolId)
  }

  /**
   * Execute a tool
   */
  async executeTool(
    toolId: string,
    input: unknown,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolId)
    if (!tool) {
      return {
        success: false,
        error: `Tool ${toolId} not found`
      }
    }

    logDebug(`Executing tool ${toolId}`)
    const startTime = Date.now()

    try {
      // Validate input against schema if available
      const validationError = this.validateInput(input, tool.definition.inputSchema)
      if (validationError) {
        return {
          success: false,
          error: `Input validation failed: ${validationError}`
        }
      }

      // Execute the tool
      const output = await tool.executor(input, context)

      logDebug(`Tool ${toolId} completed in ${Date.now() - startTime}ms`)

      return {
        success: true,
        output
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logWarn(`Tool ${toolId} failed: ${errorMessage}`)

      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Validate input against JSON schema (basic validation)
   */
  private validateInput(input: unknown, schema: JsonSchema): string | null {
    if (!schema) return null

    // Basic type validation
    const inputType = Array.isArray(input) ? 'array' : typeof input
    if (schema.type && schema.type !== inputType && input !== null) {
      return `Expected ${schema.type}, got ${inputType}`
    }

    // Required fields validation for objects
    if (
      schema.type === 'object' &&
      schema.required &&
      typeof input === 'object' &&
      input !== null
    ) {
      const obj = input as Record<string, unknown>
      for (const field of schema.required) {
        if (!(field in obj)) {
          return `Missing required field: ${field}`
        }
      }
    }

    return null
  }

  /**
   * Get tool definitions for LLM (OpenAI function format)
   */
  getToolsForLLM(toolIds?: string[]): unknown[] {
    const tools = toolIds ? this.getToolsForAgent(toolIds) : this.getAllTools()

    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.id,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }))
  }

  /**
   * Get registry statistics
   */
  getStats(): { total: number; byCategory: Record<string, number> } {
    const all = this.getAllTools()
    const byCategory: Record<string, number> = {}

    for (const tool of all) {
      const cat = tool.category || 'general'
      byCategory[cat] = (byCategory[cat] || 0) + 1
    }

    return {
      total: all.length,
      byCategory
    }
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear()
    logInfo('Cleared all tools')
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry()

// ============================================================================
// Built-in Tool Helpers
// ============================================================================

/**
 * Create a simple tool definition
 */
export function createTool(
  id: string,
  name: string,
  description: string,
  inputSchema: JsonSchema,
  executor: ToolExecutorFn,
  options?: {
    category?: string
    permissions?: AgentPermission[]
  }
): { definition: AgentTool; executor: ToolExecutorFn } {
  return {
    definition: {
      id,
      name,
      description,
      inputSchema,
      category: options?.category,
      permissions: options?.permissions
    },
    executor
  }
}
