/**
 * Intelligence Agents Type Definitions
 *
 * Core types for the Agent system that provides intelligent automation
 * capabilities built on top of IntelligenceSDK.
 *
 * @module agent
 * @version 1.0.0
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * JSON Schema for validation
 */
export interface JsonSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  required?: string[]
  description?: string
  default?: unknown
  enum?: unknown[]
}

/**
 * Agent execution status
 */
export enum AgentStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Agent permission types
 */
export enum AgentPermission {
  FILE_READ = 'file:read',
  FILE_WRITE = 'file:write',
  FILE_DELETE = 'file:delete',
  NETWORK_ACCESS = 'network:access',
  SYSTEM_EXEC = 'system:exec',
  INTELLIGENCE_INVOKE = 'intelligence:invoke',
  CLIPBOARD_READ = 'clipboard:read',
  CLIPBOARD_WRITE = 'clipboard:write',
}

// ============================================================================
// Agent Descriptor & Configuration
// ============================================================================

/**
 * Agent capability descriptor
 */
export interface AgentCapability {
  /** Unique capability ID */
  id: string
  /** Capability type */
  type: 'action' | 'query' | 'workflow' | 'chat'
  /** Human-readable name */
  name: string
  /** Description of what this capability does */
  description: string
  /** Input schema */
  inputSchema?: JsonSchema
  /** Output schema */
  outputSchema?: JsonSchema
}

/**
 * Reference to a tool that an agent can use
 */
export interface AgentToolRef {
  /** Tool ID */
  toolId: string
  /** Whether the tool is required */
  required?: boolean
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Maximum execution time in ms */
  timeout?: number
  /** Maximum retries on failure */
  maxRetries?: number
  /** Required permissions */
  permissions?: AgentPermission[]
  /** Custom configuration */
  [key: string]: unknown
}

/**
 * Agent descriptor - defines what an agent can do
 */
export interface AgentDescriptor {
  /** Unique agent ID */
  id: string
  /** Human-readable name */
  name: string
  /** Description of the agent */
  description: string
  /** Agent version */
  version: string
  /** Agent icon (carbon icon name) */
  icon?: string
  /** Agent category */
  category?: 'file' | 'search' | 'data' | 'workflow' | 'custom'
  /** Available capabilities */
  capabilities: AgentCapability[]
  /** Tools this agent can use */
  tools?: AgentToolRef[]
  /** Default configuration */
  config?: AgentConfig
  /** Whether the agent is enabled */
  enabled?: boolean
}

// ============================================================================
// Task & Execution
// ============================================================================

/**
 * Agent execution context
 */
export interface AgentContext {
  /** Session ID for conversation tracking */
  sessionId?: string
  /** Previous messages in conversation */
  messages?: AgentMessage[]
  /** Working directory for file operations */
  workingDirectory?: string
  /** Custom context data */
  metadata?: Record<string, unknown>
}

/**
 * Message in agent conversation
 */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp?: number
  toolCallId?: string
}

/**
 * Agent task definition
 */
export interface AgentTask {
  /** Unique task ID (auto-generated if not provided) */
  id?: string
  /** Target agent ID */
  agentId: string
  /** Task type */
  type: 'execute' | 'plan' | 'chat'
  /** Capability to invoke (for execute type) */
  capabilityId?: string
  /** Task input */
  input: unknown
  /** Execution context */
  context?: AgentContext
  /** Task priority (1-10, higher = more urgent) */
  priority?: number
  /** Timeout in ms */
  timeout?: number
  /** Caller identifier */
  caller?: string
}

/**
 * Tool call request from agent
 */
export interface AgentToolCall {
  id: string
  toolId: string
  input: unknown
}

/**
 * Agent execution trace step
 */
export interface AgentTraceStep {
  type: 'thought' | 'tool_call' | 'tool_result' | 'output'
  timestamp: number
  content: string
  toolCall?: AgentToolCall
  toolResult?: unknown
  error?: string
}

/**
 * Agent usage statistics
 */
export interface AgentUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  toolCalls: number
  duration: number
  cost?: number
}

/**
 * Agent execution result
 */
export interface AgentResult {
  /** Whether execution was successful */
  success: boolean
  /** Task ID */
  taskId: string
  /** Agent ID */
  agentId: string
  /** Result output */
  output?: unknown
  /** Error message if failed */
  error?: string
  /** Execution status */
  status: AgentStatus
  /** Usage statistics */
  usage?: AgentUsage
  /** Execution trace */
  trace?: AgentTraceStep[]
  /** Timestamp */
  timestamp: number
}

// ============================================================================
// Tools
// ============================================================================

/**
 * Tool execution context
 */
export interface ToolContext {
  /** Task ID */
  taskId: string
  /** Agent ID */
  agentId: string
  /** Working directory */
  workingDirectory?: string
  /** Abort signal */
  signal?: AbortSignal
}

/**
 * Agent tool definition
 */
export interface AgentTool {
  /** Unique tool ID */
  id: string
  /** Human-readable name */
  name: string
  /** Tool description (used in LLM prompts) */
  description: string
  /** Tool category */
  category?: string
  /** Input schema */
  inputSchema: JsonSchema
  /** Output schema */
  outputSchema?: JsonSchema
  /** Required permissions */
  permissions?: AgentPermission[]
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean
  output?: unknown
  error?: string
}

// ============================================================================
// Scheduler & Queue
// ============================================================================

/**
 * Task queue item
 */
export interface QueuedTask {
  task: AgentTask
  priority: number
  enqueuedAt: number
  status: AgentStatus
}

/**
 * Scheduler statistics
 */
export interface SchedulerStats {
  queueLength: number
  activeTasks: number
  completedTasks: number
  failedTasks: number
  averageWaitTime: number
  averageExecutionTime: number
}

// ============================================================================
// Events & IPC
// ============================================================================

/**
 * Agent event types
 */
export type AgentEventType =
  | 'task:started'
  | 'task:progress'
  | 'task:completed'
  | 'task:failed'
  | 'task:cancelled'
  | 'tool:called'
  | 'tool:result'

/**
 * Agent event payload
 */
export interface AgentEvent {
  type: AgentEventType
  taskId: string
  agentId: string
  timestamp: number
  data?: unknown
}

/**
 * Task progress update
 */
export interface TaskProgress {
  taskId: string
  agentId: string
  progress: number // 0-100
  step: string
  details?: string
}

// ============================================================================
// Plan & Workflow
// ============================================================================

/**
 * Agent plan step
 */
export interface AgentPlanStep {
  id: string
  description: string
  toolId?: string
  input?: unknown
  dependsOn?: string[]
  status?: AgentStatus
}

/**
 * Agent execution plan
 */
export interface AgentPlan {
  taskId: string
  agentId: string
  steps: AgentPlanStep[]
  estimatedDuration?: number
  createdAt: number
}

// ============================================================================
// Memory & Context
// ============================================================================

/**
 * Memory entry
 */
export interface MemoryEntry {
  id: string
  type: 'short_term' | 'long_term'
  content: string
  embedding?: number[]
  metadata?: Record<string, unknown>
  createdAt: number
  accessedAt: number
  importance?: number
}

/**
 * Memory query options
 */
export interface MemoryQueryOptions {
  type?: 'short_term' | 'long_term'
  limit?: number
  minImportance?: number
  semanticQuery?: string
}
