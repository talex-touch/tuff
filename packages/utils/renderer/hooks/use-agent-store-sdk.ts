import { useTuffTransport } from '../../transport'
import { createAgentStoreSdk } from '../../transport/sdk/domains/agents-store'

export function useAgentStoreSdk() {
  const transport = useTuffTransport()
  return createAgentStoreSdk(transport)
}
