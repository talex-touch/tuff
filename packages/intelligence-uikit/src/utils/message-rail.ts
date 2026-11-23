import type { TxAiMessageModel } from '../types'

export interface TxAiRailTurn {
  key: string
  messageIndex: number
  turnNumber: number
  title: string
  hasImages: boolean
}

export interface SummarizeRailOptions {
  imageTag?: string
  codeTag?: string
  fallbackLabel?: string
  maxLength?: number
}

const FENCED_CODE_RE = /```[\s\S]*?```/g
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\([^)]+\)/g
const INLINE_LINK_RE = /\[([^\]]+)\]\([^)]+\)/g
const INLINE_MARKUP_RE = /[`*_>#~]/g
const MULTISPACE_RE = /\s+/g

export function summarizeRailMessage(
  message: TxAiMessageModel,
  options: SummarizeRailOptions = {},
): string {
  const imageTag = options.imageTag ?? '[Image]'
  const codeTag = options.codeTag ?? '[Code]'
  const fallbackLabel = options.fallbackLabel ?? 'Message'
  const maxLength = options.maxLength ?? 120

  const raw = (message.content ?? '').trim()
  let normalized = raw
    .replace(MARKDOWN_IMAGE_RE, ` ${imageTag} `)
    .replace(FENCED_CODE_RE, ` ${codeTag} `)
    .replace(INLINE_LINK_RE, '$1')
    .replace(INLINE_MARKUP_RE, ' ')
    .replace(MULTISPACE_RE, ' ')
    .trim()

  if (!normalized && message.attachments?.length) {
    const first = message.attachments[0]
    const attachmentName = first
      ? ('name' in first ? first.name : 'label' in first ? first.label : undefined)
      : undefined
    normalized = attachmentName || imageTag
  }

  if (!normalized)
    return fallbackLabel

  if (normalized.length > maxLength)
    return `${normalized.slice(0, maxLength - 1).trimEnd()}…`

  return normalized
}

export interface TxAiRailPromptSegment {
  type: 'text' | 'image'
  value: string
}

export const RAIL_IMAGE_SENTINEL = '§§RAILIMAGE§§'

export function isRailImageAttachment(att: unknown): boolean {
  if (typeof att !== 'object' || att === null)
    return false
  if ('kind' in att && (att as { kind?: unknown }).kind === 'image')
    return true
  if ('type' in att && (att as { type?: unknown }).type === 'image')
    return true
  if ('mimeType' in att && String((att as { mimeType?: unknown }).mimeType).startsWith('image/'))
    return true
  return false
}

export function countRailImageAttachments(message: {
  attachments?: readonly unknown[]
  modelAttachments?: readonly unknown[]
}): number {
  const attachments = message.attachments ?? message.modelAttachments
  if (!Array.isArray(attachments))
    return 0
  return attachments.filter(isRailImageAttachment).length
}

export function buildMessageRailSegments(
  title: string,
  hasContent: boolean,
  extraImageCount: number,
  options: { sentinel?: string, fallbackLabel?: string } = {},
): TxAiRailPromptSegment[] {
  const sentinel = options.sentinel ?? RAIL_IMAGE_SENTINEL
  const fallbackLabel = options.fallbackLabel ?? 'Message'
  const segments: TxAiRailPromptSegment[] = []
  let imgIdx = 0

  if (hasContent || extraImageCount === 0) {
    const parts = title.split(sentinel)
    parts.forEach((part, index) => {
      if (part.trim().length > 0)
        segments.push({ type: 'text', value: part })
      if (index < parts.length - 1) {
        imgIdx += 1
        segments.push({ type: 'image', value: `#IMAGE${imgIdx}` })
      }
    })
  }
  for (let i = 0; i < extraImageCount; i += 1) {
    imgIdx += 1
    segments.push({ type: 'image', value: `#IMAGE${imgIdx}` })
  }
  return segments.length ? segments : [{ type: 'text', value: fallbackLabel }]
}

/**
 * Extract numbered turn anchors (`#1`, `#2`, ...) from user prompts for the rail.
 */
export function buildMessageRailTurns(
  messages: readonly TxAiMessageModel[],
  options: SummarizeRailOptions = {},
): TxAiRailTurn[] {
  const turns: TxAiRailTurn[] = []
  let turnNumber = 0

  messages.forEach((message, index) => {
    if (message.role !== 'user')
      return
    turnNumber += 1
    const raw = message.content ?? ''
    const hasImages = Boolean(message.attachments?.length || MARKDOWN_IMAGE_RE.test(raw))
    MARKDOWN_IMAGE_RE.lastIndex = 0
    turns.push({
      key: message.id || `turn-${turnNumber}`,
      messageIndex: index,
      turnNumber,
      title: summarizeRailMessage(message, {
        ...options,
        fallbackLabel: options.fallbackLabel ?? `Turn #${turnNumber}`,
      }),
      hasImages,
    })
  })

  return turns
}
