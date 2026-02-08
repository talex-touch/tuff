import { useTuffTransport } from '../../transport'
import { createAgentsSdk } from '../../transport/sdk/domains/agents'

export function useAgentsSdk() {
  const transport = useTuffTransport()
  return createAgentsSdk(transport)
}
