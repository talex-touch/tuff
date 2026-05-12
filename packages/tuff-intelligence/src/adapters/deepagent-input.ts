import type { TurnState, UserMessageAttachment } from '../protocol/session'
import { shouldIncludePilotMessageInModelContext } from '../business/pilot/conversation'

export interface DeepAgentInvokeMessage {
  type: 'system' | 'user' | 'assistant'
  content: unknown
}

interface BuildChatMessageContentOptions {
  includeInputFiles?: boolean
}

interface BuildDeepAgentMessagesOptions {
  includeInputFiles?: boolean
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function normalizeMessageRole(value: unknown): 'system' | 'user' | 'assistant' {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'system' || normalized === 'assistant') {
    return normalized
  }
  return 'user'
}

function normalizeTurnAttachments(state: TurnState): UserMessageAttachment[] {
  if (!Array.isArray(state.attachments)) {
    return []
  }

  const list: UserMessageAttachment[] = []
  for (const item of state.attachments) {
    const id = String(item?.id || '').trim()
    const ref = String(item?.ref || '').trim()
    if (!id || !ref) {
      continue
    }

    list.push({
      id,
      ref,
      type: item?.type === 'image' ? 'image' : 'file',
      name: typeof item?.name === 'string' ? item.name : undefined,
      mimeType: typeof item?.mimeType === 'string' ? item.mimeType : undefined,
      previewUrl: typeof item?.previewUrl === 'string' ? item.previewUrl : undefined,
      modelUrl: typeof item?.modelUrl === 'string' ? item.modelUrl : undefined,
      providerFileId: typeof item?.providerFileId === 'string' ? item.providerFileId : undefined,
      deliverySource: item?.deliverySource === 'id' || item?.deliverySource === 'url' || item?.deliverySource === 'base64'
        ? item.deliverySource
        : undefined,
      dataUrl: typeof item?.dataUrl === 'string' ? item.dataUrl : undefined,
      size: Number.isFinite(item?.size) ? Number(item?.size) : undefined,
    })
  }

  return list
}

function formatAttachmentSize(size: number | undefined): string {
  if (!Number.isFinite(size) || !size || size <= 0) {
    return 'unknown size'
  }
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(2)} KB`
  }
  return `${size} B`
}

export function resolveAttachmentImageUrl(attachment: UserMessageAttachment): string {
  const candidates = [
    attachment.dataUrl,
    attachment.modelUrl,
    attachment.previewUrl,
    attachment.ref,
  ]
  for (const candidate of candidates) {
    const raw = String(candidate || '').trim()
    if (!raw) {
      continue
    }
    if (raw.startsWith('data:image/')) {
      return raw
    }
    if (raw.startsWith('https://') || raw.startsWith('http://')) {
      return raw
    }
  }
  return ''
}

function resolveAttachmentFileUrl(attachment: UserMessageAttachment): string {
  const candidates = [
    attachment.modelUrl,
    attachment.previewUrl,
    attachment.ref,
  ]
  for (const candidate of candidates) {
    const raw = String(candidate || '').trim()
    if (!raw) {
      continue
    }
    if (raw.startsWith('https://') || raw.startsWith('http://')) {
      return raw
    }
  }
  return ''
}

function normalizeBase64Payload(raw: string): string {
  const normalized = String(raw || '').replace(/\s+/g, '')
  if (!normalized) {
    return ''
  }
  if (!/^[A-Z0-9+/]+={0,2}$/i.test(normalized)) {
    return ''
  }
  return normalized
}

function resolveAttachmentFileData(attachment: UserMessageAttachment): string {
  const dataUrl = String(attachment.dataUrl || '').trim()
  if (!dataUrl) {
    return ''
  }

  const dataUrlMatch = dataUrl.match(/^data:[^;]+;base64,([A-Z0-9+/=\s]+)$/i)
  if (dataUrlMatch) {
    return normalizeBase64Payload(dataUrlMatch[1] || '')
  }

  return normalizeBase64Payload(dataUrl)
}

function buildInputFileAttachmentPart(attachment: UserMessageAttachment): Record<string, unknown> | null {
  if (attachment.type === 'image') {
    return null
  }

  const part: Record<string, unknown> = {
    type: 'input_file',
  }

  const filename = String(attachment.name || '').trim()
  const providerFileId = String(attachment.providerFileId || '').trim()
  if (providerFileId) {
    part.file_id = providerFileId
    if (filename) {
      part.filename = filename
    }
    return part
  }

  const fileUrl = resolveAttachmentFileUrl(attachment)
  if (fileUrl) {
    part.file_url = fileUrl
    if (filename) {
      part.filename = filename
    }
    return part
  }

  const fileData = resolveAttachmentFileData(attachment)
  if (!fileData) {
    return null
  }

  part.file_data = fileData
  if (filename) {
    part.filename = filename
  }

  return part
}

function buildFileAttachmentMetadata(attachments: UserMessageAttachment[]): string {
  const files = attachments.filter(item => item.type !== 'image')
  if (files.length <= 0) {
    return ''
  }

  const lines = files.map((item, index) => {
    const name = String(item.name || '').trim() || item.id
    const mimeType = String(item.mimeType || '').trim() || 'application/octet-stream'
    return `${index + 1}. ${name} (${mimeType}, ${formatAttachmentSize(item.size)})`
  })
  return `\n\n[Attachment metadata]\n${lines.join('\n')}`
}

function buildAttachmentAwareText(baseText: string, attachments: UserMessageAttachment[]): string {
  const text = String(baseText || '').trim()
  const metadataBlock = buildFileAttachmentMetadata(attachments)
  if (text) {
    return `${text}${metadataBlock}`
  }
  return `Please analyze the provided attachments.${metadataBlock}`
}

export function buildChatMessageContent(
  baseText: string,
  attachments: UserMessageAttachment[],
  options?: BuildChatMessageContentOptions,
): unknown {
  if (attachments.length <= 0) {
    return String(baseText || '').trim()
  }

  const imageUrls = attachments
    .filter(item => item.type === 'image')
    .map(resolveAttachmentImageUrl)
    .filter(Boolean)

  const text = buildAttachmentAwareText(baseText, attachments)
  const fileParts = options?.includeInputFiles === false
    ? []
    : attachments
        .map(buildInputFileAttachmentPart)
        .filter((item): item is Record<string, unknown> => Boolean(item))
  if (imageUrls.length <= 0 && fileParts.length <= 0) {
    return text
  }

  const parts: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text,
    },
  ]
  for (const url of imageUrls) {
    parts.push({
      type: 'image_url',
      image_url: {
        url,
      },
    })
  }

  for (const item of fileParts) {
    parts.push(item)
  }

  return parts
}

function resolveLastUserMessageIndex(messages: TurnState['messages']): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const row = toRecord(messages[index])
    const role = normalizeMessageRole(row.role)
    if (role === 'user') {
      return index
    }
  }
  return -1
}

export function buildDeepAgentMessages(
  state: TurnState,
  options?: BuildDeepAgentMessagesOptions,
): DeepAgentInvokeMessage[] {
  const messages: DeepAgentInvokeMessage[] = []
  const attachments = normalizeTurnAttachments(state)
  const lastUserMessageIndex = resolveLastUserMessageIndex(state.messages)
  let currentIndex = -1
  for (const item of state.messages) {
    currentIndex += 1
    const row = toRecord(item)
    if (!shouldIncludePilotMessageInModelContext(row)) {
      continue
    }
    const text = String(row.content || '').trim()
    const role = normalizeMessageRole(row.role)
    const isTurnUserMessage = role === 'user' && currentIndex === lastUserMessageIndex
    if (!text && !(isTurnUserMessage && attachments.length > 0)) {
      continue
    }
    const content = isTurnUserMessage
      ? buildChatMessageContent(text, attachments, {
          includeInputFiles: options?.includeInputFiles,
        })
      : text
    messages.push({
      type: role,
      content,
    })
  }
  return messages
}

export function buildResponsesInput(state: TurnState): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = []
  const attachments = normalizeTurnAttachments(state)
  const lastUserMessageIndex = resolveLastUserMessageIndex(state.messages)
  let currentIndex = -1
  for (const item of state.messages) {
    currentIndex += 1
    const row = toRecord(item)
    if (!shouldIncludePilotMessageInModelContext(row)) {
      continue
    }
    const role = normalizeMessageRole(row.role)
    const text = String(row.content || '').trim()
    const isTurnUserMessage = role === 'user' && currentIndex === lastUserMessageIndex
    if (!text && !(isTurnUserMessage && attachments.length > 0)) {
      continue
    }

    if (isTurnUserMessage && attachments.length > 0) {
      const content: Array<Record<string, unknown>> = [
        {
          type: 'input_text',
          text: buildAttachmentAwareText(text, attachments),
        },
      ]

      for (const attachment of attachments) {
        if (attachment.type !== 'image') {
          const inputFile = buildInputFileAttachmentPart(attachment)
          if (inputFile) {
            content.push(inputFile)
          }
          continue
        }

        const imageUrl = resolveAttachmentImageUrl(attachment)
        if (!imageUrl) {
          continue
        }
        content.push({
          type: 'input_image',
          image_url: imageUrl,
        })
      }

      input.push({
        role,
        content,
      })
      continue
    }

    input.push({
      role,
      content: [
        {
          type: 'input_text',
          text,
        },
      ],
    })
  }
  return input
}
