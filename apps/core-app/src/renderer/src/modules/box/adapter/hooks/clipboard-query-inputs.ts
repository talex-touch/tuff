import type { TuffQueryInput } from '@talex-touch/utils'
import { TuffInputType } from '@talex-touch/utils'
import type { IClipboardItem } from './types'
import { isUrlLikeClipboardText } from './clipboard-text-utils'

export const MAX_TEXT_INPUT_LENGTH = 2000
export const MAX_HTML_INPUT_LENGTH = 5000
export const MIN_TEXT_ATTACHMENT_LENGTH = 80

type BuildClipboardQueryInputsOptions = {
  clipboardItem?: IClipboardItem | null
  pendingTextClipboardItem?: IClipboardItem | null
  queryText?: string
  allowPendingTextClipboard?: boolean
  filePaths?: string[]
  useFileMode?: boolean
}

type ResolvedTextClipboardSource = {
  item: IClipboardItem
  forceAttach: boolean
}

function isTextLikeClipboardItem(
  item: IClipboardItem | null | undefined
): item is IClipboardItem & { type: 'text' | 'html' } {
  return !!item && (item.type === 'text' || item.type === 'html')
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content
  return content.slice(0, maxLength)
}

export function safeSerializeClipboardMetadata(
  meta: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!meta) return undefined
  try {
    const safe: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(meta)) {
      if (value === null || value === undefined) continue
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        safe[key] = value
      } else if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
        safe[key] = [...value]
      }
    }
    return Object.keys(safe).length > 0 ? safe : undefined
  } catch {
    return undefined
  }
}

export function buildClipboardMetadata(
  item: IClipboardItem,
  extra?: Record<string, unknown>
): Record<string, unknown> | undefined {
  const baseMeta = safeSerializeClipboardMetadata(item.meta) ?? {}
  const merged = { ...baseMeta, ...(extra ?? {}) }
  if (typeof item.id === 'number') {
    merged.clipboardId = item.id
  }
  return Object.keys(merged).length > 0 ? merged : undefined
}

function resolveTextClipboardSource(
  options: BuildClipboardQueryInputsOptions
): ResolvedTextClipboardSource | null {
  const { clipboardItem, pendingTextClipboardItem, queryText, allowPendingTextClipboard } = options

  if (isTextLikeClipboardItem(clipboardItem)) {
    return { item: clipboardItem, forceAttach: false }
  }

  if (!allowPendingTextClipboard || !isTextLikeClipboardItem(pendingTextClipboardItem)) {
    return null
  }

  if (!queryText || queryText !== (pendingTextClipboardItem.content ?? '')) {
    return null
  }

  return {
    item: pendingTextClipboardItem,
    forceAttach: true
  }
}

export function buildClipboardQueryInputs(
  options: BuildClipboardQueryInputsOptions
): TuffQueryInput[] {
  const { clipboardItem, filePaths = [], useFileMode = false } = options
  const inputs: TuffQueryInput[] = []

  if (clipboardItem?.type === 'image') {
    const content = clipboardItem.thumbnail || clipboardItem.content || ''
    const metadata = buildClipboardMetadata(clipboardItem, {
      contentKind: 'preview',
      canResolveOriginal: true
    })
    inputs.push({
      type: TuffInputType.Image,
      content,
      thumbnail: clipboardItem.thumbnail ?? undefined,
      metadata
    })
    return inputs
  }

  if (useFileMode && filePaths.length > 0) {
    inputs.push({
      type: TuffInputType.Files,
      content: JSON.stringify(filePaths),
      metadata: undefined
    })
    return inputs
  }

  if (clipboardItem?.type === 'files') {
    const shouldInline = typeof clipboardItem.id !== 'number'
    const content = shouldInline ? clipboardItem.content : ''
    const metadata = buildClipboardMetadata(clipboardItem, { contentKind: 'clipboard' })
    inputs.push({
      type: TuffInputType.Files,
      content,
      metadata
    })
    return inputs
  }

  const resolvedTextClipboard = resolveTextClipboardSource(options)
  if (!resolvedTextClipboard) {
    return inputs
  }

  const { item, forceAttach } = resolvedTextClipboard
  const content = item.content ?? ''
  const shouldAttachText =
    forceAttach || isUrlLikeClipboardText(item) || content.length >= MIN_TEXT_ATTACHMENT_LENGTH

  if (!shouldAttachText) {
    return inputs
  }

  if (item.rawContent) {
    inputs.push({
      type: TuffInputType.Html,
      content: truncateContent(content, MAX_TEXT_INPUT_LENGTH),
      rawContent: truncateContent(item.rawContent, MAX_HTML_INPUT_LENGTH),
      metadata: safeSerializeClipboardMetadata(item.meta)
    })
    return inputs
  }

  inputs.push({
    type: TuffInputType.Text,
    content: truncateContent(content, MAX_TEXT_INPUT_LENGTH),
    metadata: safeSerializeClipboardMetadata(item.meta)
  })
  return inputs
}
