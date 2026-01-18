import { useTuffTransport } from '../../transport'
import { createAppSdk } from '../../transport/sdk/domains/app'

export function useAppSdk() {
  const transport = useTuffTransport()
  return createAppSdk(transport)
}
