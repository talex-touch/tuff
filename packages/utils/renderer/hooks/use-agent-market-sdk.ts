import { useTuffTransport } from '../../transport'
import { createAgentMarketSdk } from '../../transport/sdk/domains/agents-market'

export function useAgentMarketSdk() {
  const transport = useTuffTransport()
  return createAgentMarketSdk(transport)
}
