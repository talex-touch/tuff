import { createError } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { getPublishedPresetDetail } from '../../../utils/presetStore'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing preset id',
    })
  }

  const item = await getPublishedPresetDetail(event, id)
  if (!item) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Preset not found',
    })
  }

  return {
    item,
  }
})
