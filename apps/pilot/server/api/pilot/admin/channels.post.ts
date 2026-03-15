import { requirePilotAdmin } from '../../../utils/pilot-admin-auth'
import { updatePilotAdminChannelCatalog } from '../../../utils/pilot-admin-channel-config'
import type { PilotBuiltinTool, PilotChannelAdapter, PilotChannelTransport } from '../../../utils/pilot-channel'
import { quotaOk } from '../../../utils/quota-api'

interface ChannelsUpdateBody {
  defaultChannelId?: string
  channels?: Array<{
    id: string
    name?: string
    baseUrl?: string
    apiKey?: string
    model?: string
    adapter?: PilotChannelAdapter
    transport?: PilotChannelTransport
    timeoutMs?: number
    builtinTools?: PilotBuiltinTool[]
    enabled?: boolean
  }>
}

function maskSecret(value: string): string {
  const text = String(value || '').trim()
  if (text.length <= 8) {
    return text ? '********' : ''
  }
  return `${text.slice(0, 4)}...${text.slice(-4)}`
}

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  const body = await readBody<ChannelsUpdateBody>(event)
  const catalog = await updatePilotAdminChannelCatalog(event, {
    defaultChannelId: String(body?.defaultChannelId || ''),
    channels: Array.isArray(body?.channels) ? body.channels : [],
  })

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
    writable: true,
    source: 'database',
  })
})
