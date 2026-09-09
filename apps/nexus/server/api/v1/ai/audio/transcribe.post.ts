import { Buffer } from 'node:buffer'
import { createError, getHeader, readRawBody, setResponseStatus } from 'h3'
import { requireAppAuth } from '../../../../utils/auth'
import { startAsrTranscription } from '../../../../utils/asrTranscriptionService'
function toBuffer(value: string | Buffer | null | undefined): Buffer | null {
  if (value == null)
    return null
  return Buffer.isBuffer(value) ? value : Buffer.from(value)
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  const audio = toBuffer(await readRawBody(event, false))
  if (!audio)
    throw createError({ statusCode: 400, statusMessage: 'ASR_AUDIO_INVALID', data: { errorCode: 'ASR_AUDIO_INVALID' } })

  const result = await startAsrTranscription(event, userId, {
    audio,
    contentType: getHeader(event, 'content-type'),
    idempotencyKey: getHeader(event, 'x-idempotency-key'),
  })
  setResponseStatus(event, result.status === 'dispatching' ? 202 : 200)
  return result
})
