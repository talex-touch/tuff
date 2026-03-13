import { getPilotAdminChannelCatalog } from '../utils/pilot-admin-channel-config'

const BOOTSTRAP_CHANNEL_CHECK_KEY = '__pilotBootstrapChannelChecked'

type GlobalBootstrapChannelCache = typeof globalThis & {
  [BOOTSTRAP_CHANNEL_CHECK_KEY]?: boolean
}

function toBootstrapEvent(): any {
  return { context: {} }
}

export default defineNitroPlugin(async () => {
  const globalCache = globalThis as GlobalBootstrapChannelCache
  if (globalCache[BOOTSTRAP_CHANNEL_CHECK_KEY]) {
    return
  }
  globalCache[BOOTSTRAP_CHANNEL_CHECK_KEY] = true

  try {
    const catalog = await getPilotAdminChannelCatalog(toBootstrapEvent())
    if (!catalog.channels.length || !catalog.defaultChannelId) {
      console.warn('[pilot][channel] no available channels configured yet, please configure channels in admin settings.')
    }
  }
  catch (error: any) {
    console.warn(`[pilot][channel] bootstrap check failed: ${error?.message || String(error)}`)
  }
})
