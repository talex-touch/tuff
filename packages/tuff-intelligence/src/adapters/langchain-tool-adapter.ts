import type { StructuredTool } from '@langchain/core/tools'
import type {
  IntelligenceToolRiskLevel,
  ToolSource
} from '../types/intelligence'
import type {
  AnyTuffTool,
  TuffTool,
  TuffToolApprovalGate,
  TuffToolContext,
  TuffToolSource,
} from '../tools/types'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { createToolKit } from '../tools/tool-kit'

export interface AdaptedStructuredToolMetadata {
  toolId: string
  source: ToolSource
  riskLevel: IntelligenceToolRiskLevel
  approvalRequired: boolean
  metadata?: Record<string, unknown>
}

export type AdaptedStructuredTool = StructuredTool & {
  tuffMetadata: AdaptedStructuredToolMetadata
}

export interface LangChainToolAdapterDefinition<TInput = Record<string, unknown>> {
  id: string
  name: string
  description: string
  schema?: Record<string, unknown>
  source?: ToolSource
  riskLevel?: IntelligenceToolRiskLevel
  approvalRequired?: boolean
  metadata?: Record<string, unknown>
  execute: (input: TInput) => Promise<unknown>
}

export interface TuffToolAdapterOptions {
  approvalGate?: TuffToolApprovalGate
  context?: TuffToolContext
}

function normalizeSource(source: ToolSource | TuffToolSource | undefined): ToolSource {
  return source === 'mcp' ? 'mcp' : 'builtin'
}

function normalizeRiskLevel(
  riskLevel: IntelligenceToolRiskLevel | undefined
): IntelligenceToolRiskLevel {
  if (riskLevel === 'critical' || riskLevel === 'high' || riskLevel === 'medium') {
    return riskLevel
  }
  return 'low'
}

export class LangChainToolAdapter {
  static fromDefinition<TInput = Record<string, unknown>>(
    definition: LangChainToolAdapterDefinition<TInput>
  ): AdaptedStructuredTool {
    const tool = new DynamicStructuredTool({
      name: definition.name,
      description: definition.description,
      schema: definition.schema ?? {
        type: 'object',
        properties: {}
      },
      func: async (input) => {
        return await definition.execute(input as TInput)
      }
    }) as unknown as AdaptedStructuredTool

    tool.tuffMetadata = {
      toolId: definition.id,
      source: normalizeSource(definition.source),
      riskLevel: normalizeRiskLevel(definition.riskLevel),
      approvalRequired: definition.approvalRequired === true,
      metadata: definition.metadata
    }

    return tool
  }

  static fromTuffTool<TInput, TOutput>(
    definition: TuffTool<TInput, TOutput>,
    options: TuffToolAdapterOptions = {}
  ): AdaptedStructuredTool {
    const kit = createToolKit({
      approvalGate: options.approvalGate,
    })
    const tool = new DynamicStructuredTool({
      name: definition.id,
      description: definition.description,
      schema: definition.inputSchema,
      func: async (input) => {
        return await kit.invokeTool(definition, input, options.context)
      }
    }) as unknown as AdaptedStructuredTool

    tool.tuffMetadata = {
      toolId: definition.id,
      source: normalizeSource(definition.source),
      riskLevel: normalizeRiskLevel(definition.riskLevel),
      approvalRequired: definition.requiresApproval === true
        || definition.riskLevel === 'high'
        || definition.riskLevel === 'critical',
      metadata: definition.metadata
    }

    return tool
  }

  static fromTuffTools(
    definitions: AnyTuffTool[],
    options: TuffToolAdapterOptions = {}
  ): AdaptedStructuredTool[] {
    return definitions.map(tool => LangChainToolAdapter.fromTuffTool(tool, options))
  }
}
