import type { AgentDecision } from '../protocol/decision'
import type { TurnState } from '../protocol/session'

export interface AgentEngineAdapter {
  id: string
  run(state: TurnState): Promise<unknown>
}

export interface DecisionAdapter {
  id: string
  normalize(raw: unknown, state: TurnState): Promise<AgentDecision>
}

export interface ProviderAdapter {
  id: string
  provider: string
  supports(feature: string): boolean
}
