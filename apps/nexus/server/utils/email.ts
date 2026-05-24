import type { H3Event } from 'h3'
import { dispatchNotificationEvent } from './notificationDispatcher'

interface EmailPayload {
  to: string
  subject: string
  html: string
  text?: string
  action?: string
  resourceType?: string
  resourceId?: string
}

export async function sendEmail(payload: EmailPayload, event?: H3Event): Promise<void> {
  const deliveries = await dispatchNotificationEvent(event, {
    action: payload.action ?? 'auth.email.send',
    resourceType: payload.resourceType ?? 'auth_email',
    resourceId: payload.resourceId ?? null,
    deliveryChannels: ['email'],
    executionMode: 'config',
    metadata: {
      to: payload.to,
      subject: payload.subject,
      text: payload.text ?? payload.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      html: payload.html,
    },
  })

  if (deliveries.some(delivery => delivery.channel === 'email' && delivery.status === 'sent'))
    return

  console.warn('[email] No notification_channel email delivery was sent; configure an email channel such as providerType=resend.')
}
