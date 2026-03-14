import process from 'node:process'
import { getPilotAdminChannelCatalog } from '../utils/pilot-admin-channel-config'

const BOOTSTRAP_CHANNEL_CHECK_KEY = '__pilotBootstrapChannelChecked'

type GlobalBootstrapChannelCache = typeof globalThis & {
  [BOOTSTRAP_CHANNEL_CHECK_KEY]?: boolean
}

function toBootstrapEvent(): any {
  return { context: {} }
}

function resolvePostgresTarget(): string {
  const dsn = String(process.env.PILOT_POSTGRES_URL || '').trim()
  if (!dsn) {
    return 'unknown'
  }
  try {
    const parsed = new URL(dsn)
    const name = parsed.pathname.replace(/^\/+/, '') || '(default)'
    const port = parsed.port || '5432'
    return `${parsed.hostname}:${port}/${name}`
  }
  catch {
    return 'invalid-dsn'
  }
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
      console.warn('[pilot][channel] bootstrap check unavailable', {
        db: resolvePostgresTarget(),
        configuredChannelIds: catalog.channels.map(item => item.id),
        defaultChannelId: catalog.defaultChannelId || null,
        reason: !catalog.channels.length ? 'no_channels_configured' : 'missing_default_channel',
        hint: '请在管理后台配置并启用至少一个渠道。',
      })
    }
  }
  catch (error: any) {
    console.warn(`[pilot][channel] bootstrap check failed: ${error?.message || String(error)}`)
  }
})
