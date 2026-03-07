import type { AgentEngineAdapter } from './engine'
import type { TurnState } from '../protocol/session'

export interface LangChainEngineOptions {
  run: (state: TurnState) => Promise<unknown>
}

export class LangChainEngineAdapter implements AgentEngineAdapter {
  readonly id = 'langchain'

  constructor(private readonly options: LangChainEngineOptions) {}

  async run(state: TurnState): Promise<unknown> {
    return await this.options.run(state)
  }
}
