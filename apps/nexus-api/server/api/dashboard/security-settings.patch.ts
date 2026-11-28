import { createError, readBody } from 'h3'
import { requireSessionAuth } from '../../utils/auth'
import { setAllowCliIpMismatch } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const body = await readBody<{ allowCliIpMismatch?: unknown }>(event)

  if (typeof body?.allowCliIpMismatch !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'allowCliIpMismatch must be a boolean.' })
  }

  const user = await setAllowCliIpMismatch(event, userId, body.allowCliIpMismatch)

  return {
    settings: {
      allowCliIpMismatch: user?.allowCliIpMismatch ?? false,
    },
  }
})
