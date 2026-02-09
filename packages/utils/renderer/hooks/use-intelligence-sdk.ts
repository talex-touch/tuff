import { useTuffTransport } from '../../transport'
import { createIntelligenceSdk } from '../../transport/sdk/domains/intelligence'

export function useIntelligenceSdk() {
  const transport = useTuffTransport()
  return createIntelligenceSdk(transport)
}
