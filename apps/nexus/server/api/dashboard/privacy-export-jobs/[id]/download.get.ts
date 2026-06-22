import { createError, send, setHeader } from 'h3'
import { requireSessionAuth } from '../../../../utils/auth'
import { getPrivacyExportPayload } from '../../../../utils/privacyDataStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const jobId = getRouterParam(event, 'id')?.trim()
  if (!jobId)
    throw createError({ statusCode: 400, statusMessage: 'Export job id is required.' })

  const payload = await getPrivacyExportPayload(event, userId, jobId)
  setHeader(event, 'Content-Type', payload.contentType)
  setHeader(event, 'Content-Disposition', `attachment; filename="${payload.filename}"`)
  setHeader(event, 'Cache-Control', 'no-store')
  return send(event, payload.data)
})
