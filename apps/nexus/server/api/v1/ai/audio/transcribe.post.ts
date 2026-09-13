import { Buffer } from 'node:buffer'
import { createError, getHeader, getRequestWebStream, setResponseStatus, type H3Event } from 'h3'
import { requireAppAuth } from '../../../../utils/auth'
import { enforceAdminRateLimit } from '../../../../utils/adminRateLimitStore'
import { startAsrTranscription } from '../../../../utils/asrTranscriptionService'
import { ASR_AUDIO_MAX_BYTES } from '../../../../utils/asrTranscriptionStore'

const ASR_BODY_BLOCK_BYTES = 64 * 1024
const ASR_BODY_MAX_TRANSPORT_CHUNKS = 4096
const ASR_SUBMIT_RATE_LIMIT = { limit: 12, windowMs: 60_000, blockMs: 60_000 } as const
function audioBodyError(statusCode: 400 | 413, errorCode: string): Error {
  return createError({ statusCode, statusMessage: errorCode, data: { errorCode } })
}

async function readBoundedAudioBody(event: H3Event): Promise<Buffer | null> {
  const declaredLength = Number(getHeader(event, 'content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > ASR_AUDIO_MAX_BYTES)
    throw audioBodyError(413, 'ASR_AUDIO_TOO_LARGE')

  const blocks: Buffer[] = []
  let block = Buffer.allocUnsafe(ASR_BODY_BLOCK_BYTES)
  let blockBytes = 0
  let byteLength = 0
  let transportChunks = 0
  const append = (value: Buffer | Uint8Array): void => {
    transportChunks += 1
    if (transportChunks > ASR_BODY_MAX_TRANSPORT_CHUNKS)
      throw audioBodyError(413, 'ASR_AUDIO_TOO_LARGE')
    const chunk = Buffer.isBuffer(value)
      ? value
      : Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    if (byteLength + chunk.byteLength > ASR_AUDIO_MAX_BYTES)
      throw audioBodyError(413, 'ASR_AUDIO_TOO_LARGE')
    byteLength += chunk.byteLength

    let sourceOffset = 0
    while (sourceOffset < chunk.byteLength) {
      const copyBytes = Math.min(block.byteLength - blockBytes, chunk.byteLength - sourceOffset)
      chunk.copy(block, blockBytes, sourceOffset, sourceOffset + copyBytes)
      blockBytes += copyBytes
      sourceOffset += copyBytes
      if (blockBytes === block.byteLength) {
        blocks.push(block)
        block = Buffer.allocUnsafe(ASR_BODY_BLOCK_BYTES)
        blockBytes = 0
      }
    }
  }

  const webBody = getRequestWebStream(event)
  if (!webBody) return null
  const reader = webBody.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      try {
        append(value)
      } catch (error) {
        await reader.cancel().catch(() => {})
        throw error
      }
    }
  } finally {
    reader.releaseLock()
  }
  if (byteLength === 0) return null
  if (blockBytes > 0) blocks.push(block.subarray(0, blockBytes))
  return Buffer.concat(blocks, byteLength)
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  await enforceAdminRateLimit(event, {
    key: `asr-transcribe:user:${userId}`,
    ...ASR_SUBMIT_RATE_LIMIT,
  })
  const audio = await readBoundedAudioBody(event)
  if (!audio) throw audioBodyError(400, 'ASR_AUDIO_INVALID')

  const result = await startAsrTranscription(event, userId, {
    audio,
    contentType: getHeader(event, 'content-type'),
    idempotencyKey: getHeader(event, 'x-idempotency-key'),
  })
  setResponseStatus(event, result.status === 'dispatching' ? 202 : 200)
  return result
})
