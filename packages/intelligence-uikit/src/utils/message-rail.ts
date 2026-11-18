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
