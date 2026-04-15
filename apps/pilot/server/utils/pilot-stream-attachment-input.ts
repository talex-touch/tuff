import type { UserMessageInput } from '@talex-touch/tuff-intelligence/pilot-server'
import { createError } from 'h3'

function normalizeStreamAttachmentItem(
  value: unknown,
  index: number,
): NonNullable<UserMessageInput['attachments']>[number] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: `attachments[${index}] must be an object`,
    })
  }

  const row = value as Record<string, unknown>
  const id = String(row.id || '').trim()
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: `attachments[${index}].id is required`,
    })
  }

  const type = String(row.type || '').trim().toLowerCase() === 'image' ? 'image' : 'file'
  const ref = String(row.ref || '').trim()
  if (ref.startsWith('data:')) {
    throw createError({
      statusCode: 400,
      statusMessage: `attachments[${index}] must use uploaded attachment id, inline data URL is not allowed`,
    })
  }
  if (typeof row.dataUrl === 'string' && String(row.dataUrl || '').trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: `attachments[${index}] must use uploaded attachment id, dataUrl payload is not allowed`,
    })
  }

  return {
    id,
    type,
    ref: ref || `attachment://${id}`,
    name: typeof row.name === 'string' ? row.name : undefined,
    mimeType: typeof row.mimeType === 'string' ? row.mimeType : undefined,
    previewUrl: typeof row.previewUrl === 'string' ? row.previewUrl : undefined,
  }
}

export function normalizeStreamInputAttachments(raw: unknown): UserMessageInput['attachments'] {
  if (!Array.isArray(raw)) {
    return undefined
  }
  if (raw.length <= 0) {
    return []
  }
  return raw.map((item, index) => normalizeStreamAttachmentItem(item, index))
}
