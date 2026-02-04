import { useRuntimeConfig } from '#imports'

interface EmailPayload {
  to: string
  subject: string
  html: string
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const config = useRuntimeConfig()
  const apiKey = config.auth?.email?.resendApiKey as string | undefined
  const from = config.auth?.email?.from as string | undefined
  if (!apiKey || !from) {
    console.warn('[email] Missing RESEND config, skipping email send.')
    return
  }

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html
    })
  })
}

