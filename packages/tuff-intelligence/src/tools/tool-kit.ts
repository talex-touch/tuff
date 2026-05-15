import type { CapabilityManifest } from '../registry/capability-registry'
import type {
  AnyTuffTool,
  TuffTool,
  TuffToolApprovalDecision,
  TuffToolApprovalGate,
  TuffToolApprovalRequest,
  TuffToolContext,
  TuffToolError,
  TuffToolInvocationResult,
  TuffToolKitOptions,
  TuffToolListFilter,
  TuffToolManifest,
  TuffToolRiskLevel,
  TuffToolSource,
} from './types'

const DEFAULT_TOOL_SOURCE: TuffToolSource = 'builtin'
const DEFAULT_RISK_LEVEL: TuffToolRiskLevel = 'low'

function isApprovalRequired<TInput, TOutput>(tool: TuffTool<TInput, TOutput>): boolean {
  return tool.requiresApproval === true
    || tool.riskLevel === 'high'
    || tool.riskLevel === 'critical'
}

function createToolError(
  code: TuffToolError['code'],
  message: string,
  detail?: unknown,
): TuffToolError {
  return {
    code,
    message,
    detail,
  }
}

function normalizeTool<TInput, TOutput>(tool: TuffTool<TInput, TOutput>): TuffTool<TInput, TOutput> {
  return {
    ...tool,
    source: tool.source ?? DEFAULT_TOOL_SOURCE,
    riskLevel: tool.riskLevel ?? DEFAULT_RISK_LEVEL,
  }
}

function hasRequiredTags(tool: TuffTool, tags: string[] | undefined): boolean {
  if (!Array.isArray(tags) || tags.length <= 0) {
    return true
  }
  const toolTags = new Set((tool.tags ?? []).map(tag => tag.trim()).filter(Boolean))
  return tags.every(tag => toolTags.has(tag))
}

export function defineTuffTool<TInput, TOutput>(
  definition: TuffTool<TInput, TOutput>,
): TuffTool<TInput, TOutput> {
  return normalizeTool(definition)
}

export const defaultToolApprovalGate: TuffToolApprovalGate = (
  request: TuffToolApprovalRequest,
): TuffToolApprovalDecision => {
  if (!request.requiresApproval) {
    return { approved: true }
  }

  return {
    approved: false,
    reason: `Tool "${request.toolId}" requires approval.`,
  }
}

export class ToolKit {
  private readonly tools = new Map<string, AnyTuffTool>()
  private readonly approvalGate: TuffToolApprovalGate

  constructor(options: TuffToolKitOptions = {}) {
    this.approvalGate = options.approvalGate ?? defaultToolApprovalGate
  }

  register<TInput, TOutput>(tool: TuffTool<TInput, TOutput>): TuffTool<TInput, TOutput> {
    const normalized = normalizeTool(tool)
    if (this.tools.has(normalized.id)) {
      throw new Error(`Tool "${normalized.id}" is already registered.`)
    }
    this.tools.set(normalized.id, normalized as AnyTuffTool)
    return normalized
  }

  get<TInput = unknown, TOutput = unknown>(id: string): TuffTool<TInput, TOutput> | null {
    return (this.tools.get(id) as TuffTool<TInput, TOutput> | undefined) ?? null
  }

  list(filter: TuffToolListFilter = {}): AnyTuffTool[] {
    return Array.from(this.tools.values()).filter((tool) => {
      if (filter.source && tool.source !== filter.source) {
        return false
      }
      if (filter.riskLevel && tool.riskLevel !== filter.riskLevel) {
        return false
      }
      if (typeof filter.requiresApproval === 'boolean' && isApprovalRequired(tool) !== filter.requiresApproval) {
        return false
      }
      if (!hasRequiredTags(tool, filter.tags)) {
        return false
      }
      return true
    })
  }

  listManifests(filter: TuffToolListFilter = {}): TuffToolManifest[] {
    return toToolManifests(this.list(filter))
  }

  async invoke<TOutput = unknown>(
    id: string,
    input: unknown,
    context: TuffToolContext = {},
  ): Promise<TuffToolInvocationResult<TOutput>> {
    const tool = this.get<unknown, TOutput>(id)
    if (!tool) {
      return {
        ok: false,
        toolId: id,
        error: createToolError(
          'TOOL_NOT_FOUND',
          `Tool "${id}" is not registered.`,
        ),
      }
    }

    return await this.invokeTool(tool, input, context)
  }

  async invokeTool<TInput, TOutput>(
    tool: TuffTool<TInput, TOutput>,
    input: unknown,
    context: TuffToolContext = {},
  ): Promise<TuffToolInvocationResult<TOutput>> {
    const normalized = normalizeTool(tool)
    const parsedInput = normalized.inputSchema.safeParse(input)
    if (!parsedInput.success) {
      return {
        ok: false,
        toolId: normalized.id,
        error: createToolError(
          'TOOL_INPUT_INVALID',
          `Input for tool "${normalized.id}" is invalid.`,
          parsedInput.error.flatten(),
        ),
      }
    }

    const approvalRequest = this.createApprovalRequest(normalized, parsedInput.data, context)
    let approval: TuffToolApprovalDecision
    try {
      approval = await this.approvalGate(approvalRequest)
    }
    catch (error) {
      return {
        ok: false,
        toolId: normalized.id,
        error: createToolError(
          'TOOL_EXECUTION_FAILED',
          error instanceof Error ? error.message : 'Tool approval failed.',
          error,
        ),
      }
    }
    if (!approval.approved) {
      return {
        ok: false,
        toolId: normalized.id,
        error: createToolError(
          'TOOL_APPROVAL_DENIED',
          approval.reason || `Tool "${normalized.id}" was not approved.`,
        ),
        metadata: approval.metadata,
      }
    }

    try {
      const output = await normalized.execute(parsedInput.data, context)
      if (normalized.outputSchema) {
        const parsedOutput = normalized.outputSchema.safeParse(output)
        if (!parsedOutput.success) {
          return {
            ok: false,
            toolId: normalized.id,
            error: createToolError(
              'TOOL_OUTPUT_INVALID',
              `Output from tool "${normalized.id}" is invalid.`,
              parsedOutput.error.flatten(),
            ),
          }
        }

        return {
          ok: true,
          toolId: normalized.id,
          output: parsedOutput.data,
        }
      }

      return {
        ok: true,
        toolId: normalized.id,
        output,
      }
    }
    catch (error) {
      return {
        ok: false,
        toolId: normalized.id,
        error: createToolError(
          'TOOL_EXECUTION_FAILED',
          error instanceof Error ? error.message : 'Tool execution failed.',
          error,
        ),
      }
    }
  }

  private createApprovalRequest<TInput, TOutput>(
    tool: TuffTool<TInput, TOutput>,
    input: TInput,
    context: TuffToolContext,
  ): TuffToolApprovalRequest<TInput> {
    return {
      toolId: tool.id,
      name: tool.name,
      description: tool.description,
      source: tool.source ?? DEFAULT_TOOL_SOURCE,
      riskLevel: tool.riskLevel ?? DEFAULT_RISK_LEVEL,
      input,
      context,
      requiresApproval: isApprovalRequired(tool),
      metadata: tool.metadata,
    }
  }
}

export function createToolKit(options?: TuffToolKitOptions): ToolKit {
  return new ToolKit(options)
}

export function toToolManifest<TInput, TOutput>(
  tool: TuffTool<TInput, TOutput>,
): TuffToolManifest {
  const normalized = normalizeTool(tool)
  return {
    id: normalized.id,
    name: normalized.name,
    description: normalized.description,
    source: normalized.source ?? DEFAULT_TOOL_SOURCE,
    riskLevel: normalized.riskLevel ?? DEFAULT_RISK_LEVEL,
    requiresApproval: isApprovalRequired(normalized),
    inputSchema: normalized.inputSchema,
    metadata: normalized.metadata,
    tags: normalized.tags,
    examples: normalized.examples,
  }
}

export function toToolManifests(tools: AnyTuffTool[]): TuffToolManifest[] {
  return tools.map(toToolManifest)
}

export function toCapabilityManifest<TInput, TOutput>(
  tool: TuffTool<TInput, TOutput>,
  options?: TuffToolKitOptions,
): CapabilityManifest<TInput, TuffToolInvocationResult<TOutput>> {
  const normalized = normalizeTool(tool)
  const kit = createToolKit(options)

  return {
    id: normalized.id,
    description: normalized.description,
    enabled: true,
    annotations: {
      readOnly: normalized.riskLevel === 'low',
      destructive: normalized.riskLevel === 'critical',
      requiresApproval: isApprovalRequired(normalized),
    },
    invoke: async (input, context) => {
      return await kit.invokeTool(normalized, input, {
        metadata: context,
      })
    },
  }
}
