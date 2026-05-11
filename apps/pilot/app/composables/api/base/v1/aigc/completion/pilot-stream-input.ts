import type { IChatBody } from '../completion-types'

export type PilotUiStreamAttachment = NonNullable<IChatBody['attachments']>[number]

export interface PilotUiStreamInputPayload {
  message: string
  attachments: PilotUiStreamAttachment[]
}

interface UploadPilotDataUrlPayload {
  type: 'image' | 'file'
  name: string
  mimeType: string
  dataUrl: string
}

interface ResolvePilotUiStreamInputOptions {
  uploadDataUrlAttachment?: (
    sessionId: string,
    payload: UploadPilotDataUrlPayload,
  ) => Promise<PilotUiStreamAttachment>
}

function normalizePilotUiText(value: unknown): string {
  return String(value || '').trim()
}

function normalizePilotUiBlocks(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return []
  }

  const blocks: Array<Record<string, unknown>> = []
  for (const item of value) {
    if (typeof item === 'string') {
      const text = normalizePilotUiText(item)
      if (text) {
        blocks.push({
          type: 'text',
          value: text,
        })
      }
      continue
    }

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    blocks.push(item as Record<string, unknown>)
  }
  return blocks
}

function resolvePilotUserBlocks(messages: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(messages)) {
    return []
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index]
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const row = item as Record<string, unknown>
    const role = normalizePilotUiText(row.role).toLowerCase()
    if (role !== 'user') {
      continue
    }

    const content = Array.isArray(row.content) ? row.content : []
    const hasInnerList = content.some((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return false
      }
      return Array.isArray((entry as Record<string, unknown>).value)
    })

    if (!hasInnerList) {
      return normalizePilotUiBlocks(content)
    }

    const pageRaw = Number(row.page)
    const page = Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 0
    const byPage = content.find((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return false
      }
      const inner = entry as Record<string, unknown>
      return Number(inner.page) === page && Array.isArray(inner.value)
    }) as Record<string, unknown> | undefined

    const byIndex = content[page] && typeof content[page] === 'object' && !Array.isArray(content[page])
      ? content[page] as Record<string, unknown>
      : null

    const firstInner = content.find((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return false
      }
      return Array.isArray((entry as Record<string, unknown>).value)
    }) as Record<string, unknown> | undefined

    const picked = byPage
      || (byIndex && Array.isArray(byIndex.value) ? byIndex : null)
      || firstInner

    if (!picked) {
      return []
    }

    return normalizePilotUiBlocks(picked.value)
  }

  return []
}

function isPilotAttachmentType(type: string): type is 'image' | 'file' {
  return type === 'image' || type === 'file'
}

function isPilotSkippedTextType(type: string): boolean {
  return type === 'card' || type === 'tool' || type === 'error'
}

function isDataUrl(value: string): boolean {
  return /^data:[^;,]+(?:;charset=[^;,]+)?;base64,/i.test(value)
}

function parseDataUrlMimeType(value: string): string {
  const matched = value.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,/i)
  return normalizePilotUiText(matched?.[1] || '')
}

function resolvePilotMimeType(rawData: string, attachmentType: 'image' | 'file'): string {
  const data = normalizePilotUiText(rawData)
  if (data && !isDataUrl(data)) {
    return data
  }
  if (isDataUrl(data)) {
    const parsed = parseDataUrlMimeType(data)
    if (parsed) {
      return parsed
    }
  }
  return attachmentType === 'image' ? 'image/*' : 'application/octet-stream'
}

function buildAttachmentFallbackRef(attachmentId: string): string {
  return `attachment://${attachmentId}`
}

function normalizePilotAttachmentRef(value: string, attachmentId: string): { ref: string, previewUrl?: string } {
  const normalized = normalizePilotUiText(value)
  if (!normalized || isDataUrl(normalized)) {
    return {
      ref: buildAttachmentFallbackRef(attachmentId),
      previewUrl: undefined,
    }
  }
  return {
    ref: normalized,
    previewUrl: normalized,
  }
}

async function resolvePilotAttachmentPayload(
  sessionId: string,
  blockRow: Record<string, unknown>,
  options?: ResolvePilotUiStreamInputOptions,
): Promise<{ attachment: PilotUiStreamAttachment | null, warning: string | null }> {
  const typeRaw = normalizePilotUiText(blockRow.type).toLowerCase()
  const type: 'image' | 'file' = typeRaw === 'image' ? 'image' : 'file'
  const name = normalizePilotUiText(blockRow.name) || 'unnamed'
  const attachmentId = normalizePilotUiText(blockRow.attachmentId)
  const value = normalizePilotUiText(blockRow.value)
  const data = normalizePilotUiText(blockRow.data)
  const mimeType = resolvePilotMimeType(data, type)

  if (attachmentId) {
    const normalizedRef = normalizePilotAttachmentRef(value, attachmentId)
    return {
      attachment: {
        id: attachmentId,
        type,
        ref: normalizedRef.ref,
        name,
        mimeType,
        previewUrl: normalizedRef.previewUrl,
      },
      warning: null,
    }
  }

  const dataUrl = isDataUrl(value) ? value : (isDataUrl(data) ? data : '')
  if (dataUrl) {
    const uploader = options?.uploadDataUrlAttachment
    if (!uploader) {
      return {
        attachment: null,
        warning: `附件「${name}」缺少 attachmentId，且当前环境无法自动转换，请重新上传后再发送。`,
      }
    }

    const uploadedAttachment = await uploader(sessionId, {
      type,
      name,
      mimeType: resolvePilotMimeType(dataUrl, type),
      dataUrl,
    })

    blockRow.attachmentId = uploadedAttachment.id
    blockRow.type = uploadedAttachment.type
    blockRow.name = uploadedAttachment.name || name
    blockRow.value = uploadedAttachment.previewUrl || uploadedAttachment.ref
    blockRow.data = uploadedAttachment.mimeType || mimeType

    return {
      attachment: uploadedAttachment,
      warning: null,
    }
  }

  return {
    attachment: null,
    warning: `附件「${name}」缺少 attachmentId，且无法自动转换，请重新上传后再发送。`,
  }
}

export async function resolvePilotUiStreamInput(
  sessionId: string,
  messages: unknown,
  options?: ResolvePilotUiStreamInputOptions,
): Promise<PilotUiStreamInputPayload> {
  const contentBlocks = resolvePilotUserBlocks(messages)
  if (contentBlocks.length <= 0) {
    return {
      message: '',
      attachments: [],
    }
  }

  const textParts: string[] = []
  const attachments: PilotUiStreamAttachment[] = []
  const attachmentWarnings: string[] = []

  for (const blockRow of contentBlocks) {
    const type = normalizePilotUiText(blockRow.type).toLowerCase()
    const value = normalizePilotUiText(blockRow.value)

    if (isPilotAttachmentType(type)) {
      const resolved = await resolvePilotAttachmentPayload(sessionId, blockRow, options)
      if (resolved.attachment) {
        attachments.push(resolved.attachment)
      }
      else if (resolved.warning) {
        attachmentWarnings.push(resolved.warning)
      }
      continue
    }

    if (!value || isPilotSkippedTextType(type)) {
      continue
    }
    textParts.push(value)
  }

  if (attachmentWarnings.length > 0) {
    throw new Error(attachmentWarnings.join('\n'))
  }

  return {
    message: textParts.join('\n').trim(),
    attachments,
  }
}
