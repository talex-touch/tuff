import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'
import { verifyWatermarkToken } from './watermarkToken'

export function requireWatermarkToken(event: H3Event) {
  const token = getHeader(event, 'x-wm-token') || getHeader(event, 'x-watermark-token')
  if (!token) {
    throw createError({
      statusCode: 428,
      statusMessage: 'Watermark token required.',
      data: { errorCode: 'WM_MISSING' },
    })
  }

  const payload = verifyWatermarkToken(token)
  if (!payload) {
    throw createError({
      statusCode: 428,
      statusMessage: 'Watermark token invalid.',
      data: { errorCode: 'WM_TAMPERED' },
    })
  }

  return payload
}
