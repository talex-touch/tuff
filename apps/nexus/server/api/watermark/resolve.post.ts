import { createError, readBody } from 'h3'
import { decodeQrFromLuma } from '../../utils/watermarkQr'
import { findTrackingRecordByCode, normalizeTrackingCode } from '../../utils/watermarkTrackingStore'
import { requireAdmin, requireAuth } from '../../utils/auth'

interface ResolveBody {
  width: number
  height: number
  luma: number[]
  limit?: number
}

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV !== 'production')
    await requireAuth(event)
  else
    await requireAdmin(event)
  const body = await readBody<ResolveBody>(event)
  const width = Number(body?.width || 0)
  const height = Number(body?.height || 0)
  const luma = Array.isArray(body?.luma) ? body.luma : []

  if (!width || !height || luma.length !== width * height) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid watermark payload.',
    })
  }

  const decoded = decodeQrFromLuma(luma, width, height)
  const normalized = decoded ? normalizeTrackingCode(decoded) : null
  const record = normalized ? await findTrackingRecordByCode(event, normalized) : null
  const matched = Boolean(record)

  return {
    matched,
    confidence: matched ? 1 : 0,
    decodedCode: normalized,
    record: record
      ? {
          userId: record.userId,
          deviceId: record.deviceId,
          trackedAt: record.createdAt,
          lastSeenAt: record.lastSeenAt,
        }
      : null,
  }
})
