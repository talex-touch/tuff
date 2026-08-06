import { useTuffTransport } from '../../transport'
import { createMcpServersSdk } from '../../transport/sdk/domains/mcp-servers'

export function useMcpServersSdk() {
  const transport = useTuffTransport()
  return createMcpServersSdk(transport)
}
