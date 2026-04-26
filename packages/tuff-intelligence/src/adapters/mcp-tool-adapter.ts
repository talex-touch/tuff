import type { IntelligenceToolRiskLevel } from '../types/intelligence'
import { LangChainToolAdapter } from './langchain-tool-adapter'
import type { AdaptedStructuredTool, LangChainToolAdapterDefinition } from './langchain-tool-adapter'

export interface McpToolAdapterDefinition<TInput = Record<string, unknown>>
  extends Omit<LangChainToolAdapterDefinition<TInput>, 'source'> {
  serverId: string
}

export class McpToolAdapter {
  static fromDefinition<TInput = Record<string, unknown>>(
    definition: McpToolAdapterDefinition<TInput>
  ): AdaptedStructuredTool {
    return LangChainToolAdapter.fromDefinition({
      ...definition,
      source: 'mcp',
      metadata: {
        ...(definition.metadata ?? {}),
        serverId: definition.serverId
      },
      riskLevel: definition.riskLevel ?? McpToolAdapter.defaultRiskLevel(definition.id)
    })
  }

  static defaultRiskLevel(toolId: string): IntelligenceToolRiskLevel {
    const normalized = String(toolId || '').trim().toLowerCase()
    if (
      normalized.includes('delete')
      || normalized.includes('shell')
      || normalized.includes('system')
    ) {
      return 'critical'
    }
    if (
      normalized.includes('write')
      || normalized.includes('submit')
      || normalized.includes('fill')
      || normalized.includes('clipboard')
      || normalized.includes('click')
    ) {
      return 'high'
    }
    if (
      normalized.includes('open')
      || normalized.includes('search')
      || normalized.includes('navigate')
      || normalized.includes('read')
    ) {
      return 'medium'
    }
    return 'low'
  }
}
