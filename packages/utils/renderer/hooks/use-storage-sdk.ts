import { useTuffTransport } from '../../transport'
import { createStorageSdk } from '../../transport/sdk/domains/storage'

export function useStorageSdk() {
  const transport = useTuffTransport()
  return createStorageSdk(transport)
}
