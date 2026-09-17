import { useTuffTransport } from '../../transport'
import { createMcpHostSdk } from '../../transport/sdk/domains/mcp-host'

export function useMcpHostSdk() {
  const transport = useTuffTransport()
  return createMcpHostSdk(transport)
}
