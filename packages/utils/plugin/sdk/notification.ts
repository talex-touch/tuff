import { createNotificationSdk } from '../../transport/sdk/domains/notification'
import { createPluginTuffTransport } from '../../transport/sdk/plugin-transport'
import { useChannel } from './channel'

export function useNotificationSdk() {
  const channel = useChannel()
  const transport = createPluginTuffTransport(channel)
  return createNotificationSdk(transport)
}
