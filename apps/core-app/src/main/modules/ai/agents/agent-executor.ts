/**
 * Agent Executor
 *
 * Executes agent tasks with IntelligenceSDK integration.
 */

import type {
  AgentMessage,
  AgentResult,
  AgentStatus,
  AgentTask,
  AgentToolCall,
  AgentTraceStep,
  AgentUsage,
} from '@talex-touch/utils'
import chalk from 'chalk'
import type { AgentExecutionContext, AgentImpl } from './agent-registry'
import { agentRegistry } from './agent-registry'
import type { ToolRegistry } from './tool-registry'

const TAG = chalk.hex('#9c27b0').bold('[AgentExecutor]')
const logInfo = (...args: any[]) => console.log(TAG, ...args)
const logWarn = (...args: any[]) => console.warn(TAG, chalk.yellow(...args))
const logDebug = (...args: any[]) => console.debug(TAG, chalk.gray(...args))

/**
 * Executor options
 */
export interface ExecutorOptions {
  defaultTimeout?: number
  maxRetries?: number
  enableTracing?: boolean
}

/**
 * IntelligenceSDK interface (for dependency injection)
 */
export interface IntelligenceSDKInterface {
  invoke(
    capability: string,
    params: unknown,
    options?: unknown
  ): Promise<{ success: boolean, data?: unknown, error?: string }>
}

/**
 * Agent Executor - runs agent tasks
 */
export class AgentExecutor {
  private options: Required<ExecutorOptions>
  private toolRegistry: ToolRegistry | null = null
  private intelligenceSDK: IntelligenceSDKInterface | null = null
  private abortControllers: Map<string, AbortController> = new Map()

  constructor(options: ExecutorOptions = {}) {
    this.options = {
      defaultTimeout: options.defaultTimeout ?? 60000,
      maxRetries: options.maxRetries ?? 2,
      enableTracing: options.enableTracing ?? true,
    }
  }

  /**
   * Set the tool registry
   */
  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry
  }

  /**
   * Set the IntelligenceSDK instance
   */
  setIntelligenceSDK(sdk: IntelligenceSDKInterface): void {
    this.intelligenceSDK = sdk
  }

  /**
   * Execute an agent task
   */
  async executeTask(task: AgentTask): Promise<AgentResult> {
    const taskId = task.id || this.generateTaskId()
    const startTime = Date.now()
    const trace: AgentTraceStep[] = []

    logInfo(`Executing task ${taskId} for agent ${task.agentId}`)

    // Get agent
    const agent = agentRegistry.getAgent(task.agentId)
    if (!agent) {
      return this.createErrorResult(taskId, task.agentId, `Agent ${task.agentId} not found`)
    }

    // Check if agent is enabled
    if (agent.descriptor.enabled === false) {
      return this.createErrorResult(taskId, task.agentId, `Agent ${task.agentId} is disabled`)
    }

    // Create abort controller
    const abortController = new AbortController()
    this.abortControllers.set(taskId, abortController)

    // Setup timeout
    const timeout = task.timeout || agent.descriptor.config?.timeout || this.options.defaultTimeout
    const timeoutId = setTimeout(() => {
      abortController.abort()
    }, timeout)

    try {
      // Build execution context
      const context: AgentExecutionContext = {
        taskId,
        sessionId: task.context?.sessionId,
        workingDirectory: task.context?.workingDirectory,
        signal: abortController.signal,
        metadata: task.context?.metadata,
      }

      // Add thought trace
      if (this.options.enableTracing) {
        trace.push({
          type: 'thought',
          timestamp: Date.now(),
          content: `Starting ${task.type} task for agent ${task.agentId}`,
        })
      }

      let output: unknown

      // Execute based on task type
      switch (task.type) {
        case 'execute':
          output = await this.executeAction(agent.impl, task, context, trace)
          break
        case 'plan':
          output = await this.executePlan(agent.impl, task, context, trace)
          break
        case 'chat':
          output = await this.executeChat(agent.impl, task, context, trace)
          break
        default:
          throw new Error(`Unknown task type: ${task.type}`)
      }

      const duration = Date.now() - startTime

      // Add output trace
      if (this.options.enableTracing) {
        trace.push({
          type: 'output',
          timestamp: Date.now(),
          content: typeof output === 'string' ? output : JSON.stringify(output),
        })
      }

      logInfo(`Task ${taskId} completed in ${duration}ms`)

      return {
        success: true,
        taskId,
        agentId: task.agentId,
        output,
        status: 'completed' as AgentStatus,
        usage: this.calculateUsage(startTime, trace),
        trace: this.options.enableTracing ? trace : undefined,
        timestamp: Date.now(),
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isAborted = abortController.signal.aborted

      logWarn(`Task ${taskId} failed: ${errorMessage}`)

      return {
        success: false,
        taskId,
        agentId: task.agentId,
        error: isAborted ? 'Task timed out or was cancelled' : errorMessage,
        status: (isAborted ? 'cancelled' : 'failed') as AgentStatus,
        trace: this.options.enableTracing ? trace : undefined,
        timestamp: Date.now(),
      }
    }
    finally {
      clearTimeout(timeoutId)
      this.abortControllers.delete(taskId)
    }
  }

  /**
   * Execute an action task
   */
  private async executeAction(
    impl: AgentImpl,
    task: AgentTask,
    context: AgentExecutionContext,
    trace: AgentTraceStep[],
  ): Promise<unknown> {
    // If agent has custom execute, use it
    if (impl.execute) {
      return impl.execute(task.input, context)
    }

    // Otherwise, use LLM-based execution
    return this.executeLLMAction(task, context, trace)
  }

  /**
   * Execute using LLM
   */
  private async executeLLMAction(
    task: AgentTask,
    _context: AgentExecutionContext,
    trace: AgentTraceStep[],
  ): Promise<unknown> {
    if (!this.intelligenceSDK) {
      throw new Error('IntelligenceSDK not configured')
    }

    const agent = agentRegistry.getDescriptor(task.agentId)
    if (!agent) {
      throw new Error(`Agent ${task.agentId} not found`)
    }

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(agent.description, agent.capabilities)

    // Build messages
    const messages: AgentMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(task.context?.messages || []),
      { role: 'user', content: JSON.stringify(task.input) },
    ]

    // Add thought trace
    if (this.options.enableTracing) {
      trace.push({
        type: 'thought',
        timestamp: Date.now(),
        content: `Invoking LLM with ${messages.length} messages`,
      })
    }

    // Invoke LLM
    const response = await this.intelligenceSDK.invoke('text.chat', {
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }, {
      strategy: 'adaptive-default',
      modelPreference: ['gpt-4o-mini', 'deepseek-chat'],
    })

    if (!response.success) {
      throw new Error(response.error || 'LLM invocation failed')
    }

    return response.data
  }

  /**
   * Execute a plan task
   */
  private async executePlan(
    impl: AgentImpl,
    task: AgentTask,
    context: AgentExecutionContext,
    _trace: AgentTraceStep[],
  ): Promise<unknown> {
    if (impl.plan) {
      return impl.plan(task.input, context)
    }

    // Default: use LLM to generate plan
    if (!this.intelligenceSDK) {
      throw new Error('IntelligenceSDK not configured for planning')
    }

    const agent = agentRegistry.getDescriptor(task.agentId)
    if (!agent) {
      throw new Error(`Agent ${task.agentId} not found`)
    }

    const planPrompt = `You are a planning assistant for the "${agent.name}" agent.
Given the following task, create a step-by-step execution plan.

Task: ${JSON.stringify(task.input)}

Return a JSON array of steps, each with:
- id: unique step identifier
- description: what this step does
- toolId: (optional) tool to use
- input: (optional) input for the tool
- dependsOn: (optional) array of step IDs this depends on

Respond with only valid JSON.`

    const response = await this.intelligenceSDK.invoke('text.chat', {
      messages: [{ role: 'user', content: planPrompt }],
    }, {
      strategy: 'adaptive-default',
    })

    if (!response.success) {
      throw new Error(response.error || 'Plan generation failed')
    }

    return {
      taskId: task.id,
      agentId: task.agentId,
      steps: this.parsePlanResponse(response.data),
      createdAt: Date.now(),
    }
  }

  /**
   * Execute a chat task
   */
  private async executeChat(
    impl: AgentImpl,
    task: AgentTask,
    context: AgentExecutionContext,
    trace: AgentTraceStep[],
  ): Promise<unknown> {
    // If agent has streaming chat, collect all chunks
    if (impl.chat) {
      const messages = task.context?.messages || []
      const chunks: string[] = []

      for await (const chunk of impl.chat(messages, context)) {
        chunks.push(chunk)
      }

      return chunks.join('')
    }

    // Otherwise use execute
    return this.executeAction(impl, task, context, trace)
  }

  /**
   * Cancel a running task
   */
  cancelTask(taskId: string): boolean {
    const controller = this.abortControllers.get(taskId)
    if (!controller) {
      return false
    }

    controller.abort()
    logInfo(`Cancelled task ${taskId}`)
    return true
  }

  /**
   * Execute a tool call
   */
  async executeTool(toolCall: AgentToolCall, context: AgentExecutionContext): Promise<unknown> {
    if (!this.toolRegistry) {
      throw new Error('ToolRegistry not configured')
    }

    logDebug(`Executing tool ${toolCall.toolId}`)

    const result = await this.toolRegistry.executeTool(toolCall.toolId, toolCall.input, {
      taskId: context.taskId,
      agentId: '',
      workingDirectory: context.workingDirectory,
      signal: context.signal,
    })

    return result
  }

  /**
   * Build system prompt for agent
   */
  private buildSystemPrompt(description: string, capabilities: unknown[]): string {
    return `You are an intelligent agent with the following description:
${description}

Your capabilities:
${JSON.stringify(capabilities, null, 2)}

Instructions:
1. Analyze the user's request carefully
2. Use your capabilities to accomplish the task
3. Be concise and accurate in your responses
4. If you need to use tools, specify them clearly
5. Always provide structured output when appropriate`
  }

  /**
   * Parse plan response from LLM
   */
  private parsePlanResponse(data: unknown): unknown[] {
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data)
        return Array.isArray(parsed) ? parsed : [parsed]
      }
      catch {
        return [{ id: '1', description: data }]
      }
    }
    return Array.isArray(data) ? data : [data]
  }

  /**
   * Calculate usage statistics
   */
  private calculateUsage(startTime: number, trace: AgentTraceStep[]): AgentUsage {
    const toolCalls = trace.filter(t => t.type === 'tool_call').length
    return {
      promptTokens: 0, // Would be filled by actual LLM response
      completionTokens: 0,
      totalTokens: 0,
      toolCalls,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Create error result
   */
  private createErrorResult(taskId: string, agentId: string, error: string): AgentResult {
    return {
      success: false,
      taskId,
      agentId,
      error,
      status: 'failed' as AgentStatus,
      timestamp: Date.now(),
    }
  }

  /**
   * Generate task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}

// Singleton instance
export const agentExecutor = new AgentExecutor()
