import type { ActiveAppSnapshot } from './types'

const ensurePluginChannel = () => {
  const channel = (window as any)?.$channel
  if (!channel) {
    throw new Error('[Plugin SDK] System channel requires plugin renderer context with $channel available.')
  }
  return channel
}

export async function getActiveAppSnapshot(options: { forceRefresh?: boolean } = {}): Promise<ActiveAppSnapshot | null> {
  const channel = ensurePluginChannel()
  return channel.send('system:get-active-app', options)
}
