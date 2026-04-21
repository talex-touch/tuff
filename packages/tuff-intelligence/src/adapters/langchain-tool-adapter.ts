import type { StructuredTool } from '@langchain/core/tools'
import type {
  IntelligenceToolRiskLevel,
  ToolSource
} from '../types/intelligence'
import { DynamicStructuredTool } from '@langchain/core/tools'

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

function normalizeSource(source: ToolSource | undefined): ToolSource {
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
}
