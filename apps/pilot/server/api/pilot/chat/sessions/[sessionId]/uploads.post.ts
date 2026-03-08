import type { H3Event } from 'h3'
import { createHmac, randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { requirePilotAuth } from '../../../../../utils/auth'
import { requireSessionId } from '../../../../../utils/pilot-http'
import { createPilotStoreAdapter, getPilotAttachmentBucket } from '../../../../../utils/pilot-store'

interface UploadRequestBody {
  name?: string
  mimeType?: string
  size?: number
  contentBase64?: string
}

function safeFileName(value: string): string {
  return value.replace(/[^\w.-]/g, '_').slice(0, 80) || 'attachment.bin'
}

function signUploadToken(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

function decodeBase64ToBytes(contentBase64: string): Uint8Array {
  const source = contentBase64.includes(',') ? contentBase64.split(',').pop() || '' : contentBase64
  const binary = atob(source)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function getPilotRuntimeConfig(event: H3Event): Record<string, unknown> {
  const runtimeConfig = (event.context as { runtimeConfig?: Record<string, unknown> }).runtimeConfig
  return runtimeConfig?.pilot && typeof runtimeConfig.pilot === 'object'
    ? (runtimeConfig.pilot as Record<string, unknown>)
    : {}
}

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)
  const body = await readBody<UploadRequestBody>(event)

  const name = safeFileName(String(body?.name || 'attachment.bin'))
  const mimeType = String(body?.mimeType || 'application/octet-stream').slice(0, 120)
  const size = Number.isFinite(body?.size) ? Math.max(0, Number(body?.size)) : 0

  const attachmentId = randomUUID()
  const objectKey = `pilot/${userId}/${sessionId}/${attachmentId}/${name}`

  const runtimeConfig = getPilotRuntimeConfig(event)
  const secret = String(runtimeConfig.uploadSignSecret || '').trim() || 'pilot-dev-secret'
  const publicBase = String(runtimeConfig.uploadPublicBase || '').trim() || '/r2/pilot'

  const expiresAt = Date.now() + 10 * 60 * 1000
  const signPayload = `${objectKey}:${expiresAt}:${size}`
  const signature = signUploadToken(secret, signPayload)

  const bucket = getPilotAttachmentBucket(event)
  if (bucket && typeof body?.contentBase64 === 'string' && body.contentBase64.length > 0) {
    try {
      const binary = decodeBase64ToBytes(body.contentBase64)
      await bucket.put(objectKey, binary, {
        httpMetadata: {
          contentType: mimeType,
        },
      })
    }
    catch {
      throw createError({
        statusCode: 400,
        statusMessage: 'contentBase64 is invalid',
      })
    }
  }

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()

  const ref = `r2://${objectKey}`
  await store.runtime.saveAttachment({
    id: attachmentId,
    sessionId,
    kind: mimeType.startsWith('image/') ? 'image' : 'file',
    name,
    mimeType,
    size,
    ref,
    createdAt: new Date().toISOString(),
  })

  return {
    attachment: {
      id: attachmentId,
      sessionId,
      name,
      mimeType,
      size,
      ref,
    },
    upload: {
      method: 'PUT',
      url: `${publicBase}/${objectKey}`,
      expiresAt,
      signature,
      payload: signPayload,
    },
    directUploaded: Boolean(bucket && body?.contentBase64),
  }
})
