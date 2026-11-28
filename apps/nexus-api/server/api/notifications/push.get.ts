import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { requireAuth } from '../../utils/auth'
import { listBrowserPushSubscriptions } from '../../utils/browserPushSubscriptionStore'
import { readCloudflareBindings } from '../../utils/cloudflare'

function resolveVapidPublicKey(event: Parameters<typeof readCloudflareBindings>[0]): string | null {
  const bindings = readCloudflareBindings(event)
  const config = useRuntimeConfig(event) as {
    notificationWebPush?: { publicKey?: string }
    public?: { notificationWebPush?: { publicKey?: string } }
  }
  const raw = bindings?.NOTIFICATION_WEB_PUSH_PUBLIC_KEY
    || config.notificationWebPush?.publicKey
    || config.public?.notificationWebPush?.publicKey
    || ''
  const trimmed = raw.trim()
  return trimmed || null
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const query = getQuery(event)
  const subscriptions = await listBrowserPushSubscriptions(event, {
    userId,
    limit: query.limit,
  })
  const vapidPublicKey = resolveVapidPublicKey(event)

  return {
    subscriptions,
    vapidPublicKey,
    enabled: Boolean(vapidPublicKey),
  }
})
