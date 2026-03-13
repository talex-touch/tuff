import { createHmac, randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { requirePilotAuth } from '../../../../../utils/auth'
import {
  buildPilotAttachmentPreviewUrl,
  getPilotAttachmentUploadAvailability,
  putPilotAttachmentObject,
} from '../../../../../utils/pilot-attachment-storage'
import { resolvePilotConfigString } from '../../../../../utils/pilot-config'
import { requireSessionId } from '../../../../../utils/pilot-http'
import { createPilotStoreAdapter } from '../../../../../utils/pilot-store'

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

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)
  const body = await readBody<UploadRequestBody>(event)

  const name = safeFileName(String(body?.name || 'attachment.bin'))
  const mimeType = String(body?.mimeType || 'application/octet-stream').slice(0, 120)
  const size = Number.isFinite(body?.size) ? Math.max(0, Number(body?.size)) : 0

  const attachmentId = randomUUID()
  const objectKey = `pilot/${userId}/${sessionId}/${attachmentId}/${name}`

  const secret = resolvePilotConfigString(event, 'cookieSecret', ['PILOT_COOKIE_SECRET']) || 'pilot-dev-secret'
  const publicBase = '/attachments/pilot'

  const expiresAt = Date.now() + 10 * 60 * 1000
  const signPayload = `${objectKey}:${expiresAt}:${size}`
  const signature = signUploadToken(secret, signPayload)

  const availability = await getPilotAttachmentUploadAvailability(event)
  if (!availability.allowed) {
    throw createError({
      statusCode: 400,
      statusMessage: availability.reason || 'Attachments are unavailable in current environment.',
    })
  }

  if (typeof body?.contentBase64 !== 'string' || !body.contentBase64.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'contentBase64 is required',
    })
  }

  let storedRef = ''
  try {
    const binary = decodeBase64ToBytes(body.contentBase64)
    const stored = await putPilotAttachmentObject(event, {
      key: objectKey,
      bytes: binary,
      mimeType,
    })
    storedRef = stored.ref
  }
  catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'contentBase64 is invalid',
    })
  }

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()

  const ref = storedRef || `memory://${objectKey}`
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
      previewUrl: buildPilotAttachmentPreviewUrl(sessionId, attachmentId),
    },
    upload: {
      method: 'PUT',
      url: `${publicBase}/${objectKey}`,
      expiresAt,
      signature,
      payload: signPayload,
    },
    directUploaded: true,
  }
})
