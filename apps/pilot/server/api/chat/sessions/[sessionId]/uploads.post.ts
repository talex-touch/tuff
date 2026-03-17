import type { H3Event } from 'h3'
import { createHmac, randomUUID } from 'node:crypto'
import { createError, getHeader } from 'h3'
import { requirePilotAuth } from '../../../../utils/auth'
import {
  buildPilotAttachmentPreviewUrl,
  getPilotAttachmentUploadAvailability,
  putPilotAttachmentObject,
  resolvePilotAttachmentModelUrl,
} from '../../../../utils/pilot-attachment-storage'
import { resolvePilotConfigString } from '../../../../utils/pilot-config'
import { requireSessionId } from '../../../../utils/pilot-http'
import { createPilotStoreAdapter } from '../../../../utils/pilot-store'

interface UploadRequestBody {
  name?: string
  mimeType?: string
  size?: number
  contentBase64?: string
}

interface ParsedUploadPayload {
  name: string
  mimeType: string
  bytes: Uint8Array
  source: 'base64' | 'multipart'
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

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

async function parseMultipartUpload(event: H3Event): Promise<ParsedUploadPayload> {
  const files = await readMultipartFormData(event)
  const first = files?.find(item => item?.data && item.data.byteLength > 0)
  if (!first || !first.data) {
    throw createError({
      statusCode: 400,
      statusMessage: 'file is required',
    })
  }

  return {
    name: safeFileName(String(first.filename || 'attachment.bin')),
    mimeType: String(first.type || 'application/octet-stream').slice(0, 120),
    bytes: Uint8Array.from(first.data),
    source: 'multipart',
  }
}

async function parseBase64Upload(event: H3Event): Promise<ParsedUploadPayload> {
  const body = await readBody<UploadRequestBody>(event)
  if (typeof body?.contentBase64 !== 'string' || !body.contentBase64.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'contentBase64 is required',
    })
  }

  let bytes: Uint8Array
  try {
    bytes = decodeBase64ToBytes(body.contentBase64)
  }
  catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'contentBase64 is invalid',
    })
  }

  return {
    name: safeFileName(String(body?.name || 'attachment.bin')),
    mimeType: String(body?.mimeType || 'application/octet-stream').slice(0, 120),
    bytes,
    source: 'base64',
  }
}

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)
  const contentType = String(getHeader(event, 'content-type') || '').toLowerCase()
  const parsed = contentType.includes('multipart/form-data')
    ? await parseMultipartUpload(event)
    : await parseBase64Upload(event)
  const name = parsed.name
  const mimeType = parsed.mimeType
  const binary = parsed.bytes
  const size = binary.byteLength

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

  if (binary.byteLength <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'file is empty',
    })
  }

  if (binary.byteLength > MAX_ATTACHMENT_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'file is too large (max 10MB)',
    })
  }

  let storedRef = ''
  try {
    const stored = await putPilotAttachmentObject(event, {
      key: objectKey,
      bytes: binary,
      mimeType,
    })
    storedRef = stored.ref
  }
  catch (error) {
    console.error('[pilot][attachment] upload failed', {
      sessionId,
      attachmentId,
      objectKey,
      mimeType,
      size,
      error: error instanceof Error ? error.message : String(error),
    })
    throw createError({
      statusCode: 503,
      statusMessage: 'Attachment storage is temporarily unavailable.',
    })
  }

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()

  const ref = storedRef || `memory://${objectKey}`
  const kind = mimeType.startsWith('image/') ? 'image' : 'file'
  await store.runtime.saveAttachment({
    id: attachmentId,
    sessionId,
    kind,
    name,
    mimeType,
    size,
    ref,
    createdAt: new Date().toISOString(),
  })
  const previewUrl = buildPilotAttachmentPreviewUrl(sessionId, attachmentId)
  const modelUrl = await resolvePilotAttachmentModelUrl(event, {
    sessionId,
    attachmentId,
    ref,
  })

  return {
    attachment: {
      id: attachmentId,
      sessionId,
      name,
      mimeType,
      size,
      kind,
      type: kind,
      ref,
      previewUrl,
      modelUrl,
      deliverySource: 'url',
    },
    upload: {
      method: 'PUT',
      url: `${publicBase}/${objectKey}`,
      expiresAt,
      signature,
      payload: signPayload,
    },
    directUploaded: true,
    source: parsed.source,
  }
})
