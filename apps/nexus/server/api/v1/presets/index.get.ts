import { createError } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { listPublishedPresets } from '../../../utils/presetStore'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const rawChannel = typeof query.channel === 'string' ? query.channel : undefined

  if (rawChannel && rawChannel !== 'stable' && rawChannel !== 'beta') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid channel parameter',
    })
  }

  const channel = rawChannel === 'stable' || rawChannel === 'beta' ? rawChannel : undefined

  const items = await listPublishedPresets(event, {
    channel,
  })

  return {
    items,
  }
})
