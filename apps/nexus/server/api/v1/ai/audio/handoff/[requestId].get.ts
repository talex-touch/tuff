import { createError, getQuery, getRouterParam, setResponseHeader } from 'h3'
import { getAsrHandoffObject } from '../../../../../utils/asrTranscriptionStore'

export default defineEventHandler(async (event) => {
  const requestId = getRouterParam(event, 'requestId') ?? ''
  const token = getQuery(event).token
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
    throw createError({ statusCode: 404, statusMessage: 'Not found.' })
  }

  const handoff = await getAsrHandoffObject(event, requestId, token)
  if (!handoff)
    throw createError({ statusCode: 404, statusMessage: 'Not found.' })

  setResponseHeader(event, 'Content-Type', handoff.contentType)
  setResponseHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'Content-Length', handoff.data.byteLength)
})
