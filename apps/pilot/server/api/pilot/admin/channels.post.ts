import type { PilotBuiltinTool, PilotChannelAdapter, PilotChannelTransport } from '../../../utils/pilot-channel'
import { requirePilotAdmin } from '../../../utils/pilot-admin-auth'
import { updatePilotAdminSettings } from '../../../utils/pilot-admin-settings'
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

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  const body = await readBody<ChannelsUpdateBody>(event)
  const settings = await updatePilotAdminSettings(event, {
    channels: {
      defaultChannelId: String(body?.defaultChannelId || ''),
      channels: Array.isArray(body?.channels) ? body.channels : [],
    },
  })

  return quotaOk(settings.channels)
})
