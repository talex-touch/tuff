import type {
  AiAutomationDefinition,
  AiAutomationPolicy,
  AiExecutionBudget
} from '@talex-touch/utils/types/ai-orchestrator'
import { resolve } from 'node:path'

const DEFAULT_EXECUTION_BUDGET: AiExecutionBudget = {
  maxSteps: 20,
  maxToolCalls: 20,
  maxChildRuns: 0,
  maxConcurrency: 1
}

function normalizedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    )
  )
}

export function normalizeAutomationPolicy(
  definition: Pick<AiAutomationDefinition, 'profileId' | 'cwd' | 'timeoutMs'>,
  policy?: Partial<AiAutomationPolicy>
): AiAutomationPolicy {
  const budget = policy?.budget ?? DEFAULT_EXECUTION_BUDGET
  const maxCost =
    typeof budget.maxCost === 'number' && budget.maxCost >= 0 ? budget.maxCost : undefined
  return {
    version: Math.max(1, Math.floor(policy?.version ?? 1)),
    allowedToolIds: normalizedStrings(policy?.allowedToolIds),
    allowedMcpServerIds: normalizedStrings(policy?.allowedMcpServerIds),
    allowedAgentProfileIds: normalizedStrings(
      policy?.allowedAgentProfileIds?.length
        ? policy.allowedAgentProfileIds
        : [definition.profileId]
    ),
    allowedPaths: normalizedStrings(
      policy?.allowedPaths?.length
        ? policy.allowedPaths.map((path) => resolve(path))
        : definition.cwd
          ? [resolve(definition.cwd)]
          : []
    ),
    allowedNetworkTargets: normalizedStrings(policy?.allowedNetworkTargets).map((target) =>
      target.toLowerCase()
    ),
    budget: {
      maxSteps: Math.max(1, Math.min(100, Math.floor(budget.maxSteps ?? 20))),
      maxToolCalls: Math.max(1, Math.min(100, Math.floor(budget.maxToolCalls ?? 20))),
      ...(maxCost !== undefined ? { maxCost } : {}),
      maxChildRuns: Math.max(0, Math.min(32, Math.floor(budget.maxChildRuns ?? 0))),
      maxConcurrency: Math.max(1, Math.min(16, Math.floor(budget.maxConcurrency ?? 1)))
    },
    timeoutMs: Math.max(
      1_000,
      Math.min(24 * 60 * 60 * 1000, policy?.timeoutMs ?? definition.timeoutMs ?? 10 * 60 * 1000)
    ),
    maxRunsPerWindow: Math.max(1, Math.min(10_000, Math.floor(policy?.maxRunsPerWindow ?? 60))),
    windowMs: Math.max(
      60_000,
      Math.min(30 * 24 * 60 * 60 * 1000, policy?.windowMs ?? 60 * 60 * 1000)
    )
  }
}
