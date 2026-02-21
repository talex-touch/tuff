import { createError, getHeader, setHeader, setResponseStatus } from 'h3'
import { getUpdateById } from '../../../utils/dashboardStore'
import { requireUpdateAsset } from '../../../utils/updateAssetStorage'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Update id is required.' })
  }

  const update = await getUpdateById(event, id)

  if (!update || !update.payloadKey) {
    throw createError({ statusCode: 404, statusMessage: 'Update payload not found.' })
  }

  const etag = update.payloadSha256 ? `"${update.payloadSha256}"` : null
  if (etag) {
    const ifNoneMatch = getHeader(event, 'if-none-match')
    if (ifNoneMatch && ifNoneMatch === etag) {
      setResponseStatus(event, 304)
      return ''
    }
    setHeader(event, 'etag', etag)
    setHeader(event, 'x-content-sha256', update.payloadSha256 ?? '')
  }

  const asset = await requireUpdateAsset(event, update.payloadKey)
  setHeader(event, 'Content-Type', update.payloadContentType || asset.contentType)
  setHeader(event, 'Cache-Control', 'public, max-age=300')
  setHeader(event, 'Content-Length', asset.data.byteLength)

  return asset.data
})
