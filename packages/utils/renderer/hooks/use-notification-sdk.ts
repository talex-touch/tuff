import { createNotificationSdk } from '../../transport/sdk/domains/notification'
import { useTuffTransport } from '../../transport/sdk/index'

export function useNotificationSdk() {
  const transport = useTuffTransport()
  return createNotificationSdk(transport)
}
