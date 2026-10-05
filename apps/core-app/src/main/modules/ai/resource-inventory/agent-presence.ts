/**
 * How many of a resource each agent on this machine holds.
 *
 * Counted from the rows a page lists, so the number on an agent's chip is exactly the number of rows
 * that chip filters down to.
 */

import type { AgentPresence, AiAgentId } from '@talex-touch/utils/types/ai-orchestrator'
import { aiAgentLabel } from '@talex-touch/utils/types/ai-orchestrator'

export type AgentPresenceResource = 'skill' | 'mcp'

/**
 * One entry per agent with at least one row, most rows first, then by name. A row naming the same
 * agent twice (two links, two config files) counts once: the count is rows, not mentions.
 */
export function countAgentPresence(
  rows: Iterable<{ agentIds: Iterable<AiAgentId> }>,
  resource: AgentPresenceResource
): AgentPresence[] {
  const counts = new Map<AiAgentId, number>()
  for (const row of rows) {
    for (const agentId of new Set(row.agentIds)) counts.set(agentId, (counts.get(agentId) ?? 0) + 1)
  }
  return [...counts]
    .map(([agentId, count]) => ({
      agentId,
      label: aiAgentLabel(agentId),
      skillCount: resource === 'skill' ? count : null,
      mcpServerCount: resource === 'mcp' ? count : null
    }))
    .sort(
      (left, right) =>
        countOf(right, resource) - countOf(left, resource) ||
        left.label.localeCompare(right.label) ||
        left.agentId.localeCompare(right.agentId)
    )
}

function countOf(presence: AgentPresence, resource: AgentPresenceResource): number {
  return (resource === 'skill' ? presence.skillCount : presence.mcpServerCount) ?? 0
}
