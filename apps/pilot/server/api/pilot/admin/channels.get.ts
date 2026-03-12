import { requirePilotAuth } from '../../../utils/auth'
import { getPilotChannelCatalog } from '../../../utils/pilot-channel'
import { quotaOk } from '../../../utils/quota-api'

function maskSecret(value: string): string {
  const text = String(value || '').trim()
  if (text.length <= 8) {
    return text ? '********' : ''
  }
  return `${text.slice(0, 4)}...${text.slice(-4)}`
}

export default defineEventHandler((event) => {
  requirePilotAuth(event)
  const catalog = getPilotChannelCatalog(event)

  return quotaOk({
    defaultChannelId: catalog.defaultChannelId,
    channels: catalog.channels.map(channel => ({
      id: channel.id,
      name: channel.name,
      model: channel.model,
      baseUrl: channel.baseUrl,
      apiKeyMasked: maskSecret(channel.apiKey),
      adapter: channel.adapter,
      transport: channel.transport,
      timeoutMs: channel.timeoutMs,
      builtinTools: channel.builtinTools,
      enabled: channel.enabled,
    })),
    writable: false,
    source: 'env',
  })
})
