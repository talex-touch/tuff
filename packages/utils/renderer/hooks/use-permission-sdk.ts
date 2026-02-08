import { useTuffTransport } from '../../transport'
import { createPermissionSdk } from '../../transport/sdk/domains/permission'

export function usePermissionSdk() {
  const transport = useTuffTransport()
  return createPermissionSdk(transport)
}
