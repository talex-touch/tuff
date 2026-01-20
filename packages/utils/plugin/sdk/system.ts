import type { ActiveAppSnapshot } from './types'
import { useChannel } from './channel'

export async function getActiveAppSnapshot(options: { forceRefresh?: boolean } = {}): Promise<ActiveAppSnapshot | null> {
  const channel = useChannel('[Plugin SDK] System channel requires plugin renderer context with $channel available.')
  return channel.send('system:get-active-app', options)
}
