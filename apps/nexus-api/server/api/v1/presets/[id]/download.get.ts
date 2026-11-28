import { createError, setHeader } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { downloadPublishedPreset } from '../../../../utils/presetStore'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing preset id',
    })
  }

  const result = await downloadPublishedPreset(event, id)
  if (!result) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Preset not found',
    })
  }

  setHeader(event, 'etag', result.etag)
  setHeader(event, 'x-content-sha256', result.sha256)

  return {
    preset: result.preset,
    sha256: result.sha256,
    etag: result.etag,
  }
})
