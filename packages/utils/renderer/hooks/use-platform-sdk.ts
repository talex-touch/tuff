import { useTuffTransport } from '../../transport'
import { createPlatformSdk } from '../../transport/sdk/domains/platform'

export function usePlatformSdk() {
  const transport = useTuffTransport()
  return createPlatformSdk(transport)
}
