import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'

export type ClipboardFilter = 'all' | 'text' | 'image' | 'files' | 'favorite'

export interface ClipboardSection {
  key: string
  label: string
  count: number
  items: PluginClipboardItem[]
}

export interface ClipboardInfoRow {
  label: string
  value: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseFileList(content: string | null | undefined): string[] {
  if (!content) {
    return []
  }

  try {
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((value): value is string => typeof value === 'string' && value.length > 0)
  }
  catch {
    return []
  }
}

function formatBytes(bytes: number | null | undefined): string {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) {
    return '未知'
  }

  if (bytes < 1024) {
    return `${bytes} B`
  }

  const kb = bytes / 1024
  if (kb < 1024) {
    return `${Math.round(kb)} KB`
  }

  const mb = kb / 1024
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function normalizeTimestamp(timestamp: PluginClipboardItem['timestamp']): number | null {
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    return timestamp
  }

  if (timestamp instanceof Date) {
    return timestamp.getTime()
  }

  if (typeof timestamp === 'string' && timestamp.length > 0) {
    const next = new Date(timestamp).getTime()
    return Number.isFinite(next) ? next : null
  }

  return null
}

function getMeta(item: PluginClipboardItem): Record<string, unknown> {
  return isRecord(item.meta) ? item.meta : {}
}

function getImageSize(item: PluginClipboardItem): { width: number; height: number } | null {
  const meta = getMeta(item)
  const raw = meta.image_size
  if (!isRecord(raw)) {
    return null
  }

  const width = Number(raw.width)
  const height = Number(raw.height)
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null
  }

  return { width, height }
}

function getImageFileSize(item: PluginClipboardItem): number | null {
  const meta = getMeta(item)
  const size = Number(meta.image_file_size)
  return Number.isFinite(size) ? size : null
}

function isRenderableImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) {
    return false
  }

  return (
    value.startsWith('data:image/') ||
    value.startsWith('blob:') ||
    value.startsWith('tfile:') ||
    value.startsWith('file:') ||
    value.startsWith('http://') ||
    value.startsWith('https://')
  )
}

export function resolveListImageSrc(item: PluginClipboardItem | null | undefined): string | null {
  if (!item || item.type !== 'image') {
    return null
  }

  return isRenderableImageUrl(item.thumbnail) ? item.thumbnail : null
}

export function resolveDetailImageSrc(item: PluginClipboardItem | null | undefined): string | null {
  if (!item || item.type !== 'image') {
    return null
  }

  const meta = getMeta(item)
  const originalUrl = meta.image_original_url
  if (isRenderableImageUrl(originalUrl)) {
    return originalUrl
  }

  const contentKind = typeof meta.image_content_kind === 'string' ? meta.image_content_kind : ''
  if (contentKind === 'thumbnail') {
    return null
  }

  if (isRenderableImageUrl(item.content) && item.content !== item.thumbnail) {
    return item.content
  }

  const previewUrl = meta.image_preview_url
  if (isRenderableImageUrl(previewUrl)) {
    return previewUrl
  }

  return null
}

export function inferClipboardMime(item: PluginClipboardItem | null | undefined): string {
  if (!item) {
    return 'unknown'
  }

  if (item.type === 'image') {
    return 'image/png'
  }

  if (item.type === 'files') {
    return 'application/x-tuff-files'
  }

  return item.rawContent ? 'text/html' : 'text/plain'
}

export function getClipboardTypeLabel(item: PluginClipboardItem | null | undefined): string {
  if (!item) {
    return '未知'
  }

  if (item.type === 'image') {
    return '图片数据'
  }

  if (item.type === 'files') {
    return '文件列表'
  }

  return item.rawContent ? '富文本' : '文本内容'
}

export function getClipboardSizeLabel(item: PluginClipboardItem | null | undefined): string {
  if (!item) {
    return '未知'
  }

  if (item.type === 'image') {
    const imageSize = getImageSize(item)
    const fileSize = getImageFileSize(item)
    if (imageSize && fileSize) {
      return `${imageSize.width} × ${imageSize.height} · ${formatBytes(fileSize)}`
    }
    if (imageSize) {
      return `${imageSize.width} × ${imageSize.height}`
    }
    if (fileSize) {
      return formatBytes(fileSize)
    }
    return '未知'
  }

  if (item.type === 'files') {
    const files = parseFileList(item.content)
    return `${files.length} 个文件`
  }

  return `${item.content.length} 字符`
}

export function getClipboardTitle(item: PluginClipboardItem): string {
  if (item.type === 'image') {
    const imageSize = getClipboardSizeLabel(item)
    return `${inferClipboardMime(item)}${imageSize !== '未知' ? ` · ${imageSize}` : ''}`
  }

  if (item.type === 'files') {
    const files = parseFileList(item.content)
    if (files.length === 1) {
      return files[0]?.split(/[\\/]/).pop() || '文件'
    }
    if (files.length > 1) {
      return `${files.length} 个文件`
    }
    return '文件列表'
  }

  const text = item.content.replace(/\s+/g, ' ').trim()
  if (!text) {
    return '空文本'
  }
  return text.length > 72 ? `${text.slice(0, 71)}…` : text
}

export function getClipboardSubtitle(item: PluginClipboardItem): string {
  const time = normalizeTimestamp(item.timestamp)
  const timeLabel = time ? formatDate(time) : '刚刚'

  if (item.type === 'text') {
    const lines = item.content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)

    const preview = lines[1] ?? lines[0] ?? '文本内容'
    return `${preview.slice(0, 40)}${preview.length > 40 ? '…' : ''} · ${timeLabel}`
  }

  if (item.type === 'files') {
    return `${getClipboardSizeLabel(item)} · ${timeLabel}`
  }

  return timeLabel
}

export function getClipboardInfoRows(item: PluginClipboardItem): ClipboardInfoRow[] {
  const timestamp = normalizeTimestamp(item.timestamp)

  return [
    {
      label: '来源应用',
      value: item.sourceApp || '未知来源',
    },
    {
      label: '内容类型',
      value: getClipboardTypeLabel(item),
    },
    {
      label: '大小',
      value: getClipboardSizeLabel(item),
    },
    {
      label: 'MIME',
      value: inferClipboardMime(item),
    },
    {
      label: '记录时间',
      value: timestamp ? formatDate(timestamp) : '未知',
    },
  ]
}

export function groupClipboardItems(items: PluginClipboardItem[]): ClipboardSection[] {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
  })
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = today.getTime() - 24 * 60 * 60 * 1000
  const map = new Map<string, ClipboardSection>()

  for (const item of items) {
    const timestamp = normalizeTimestamp(item.timestamp) ?? Date.now()
    const day = new Date(timestamp)
    day.setHours(0, 0, 0, 0)

    const key = String(day.getTime())
    let label = formatter.format(day.getTime())
    if (day.getTime() === today.getTime()) {
      label = '今天'
    }
    else if (day.getTime() === yesterday) {
      label = '昨天'
    }

    const section = map.get(key) ?? {
      key,
      label,
      count: 0,
      items: [],
    }

    section.items.push(item)
    section.count += 1
    map.set(key, section)
  }

  return Array.from(map.values()).sort((left, right) => Number(right.key) - Number(left.key))
}

export function selectNextClipboardItemId(
  items: PluginClipboardItem[],
  currentSelectedId: number | null,
  removedId?: number | null,
): number | null {
  if (items.length === 0) {
    return null
  }

  if (currentSelectedId === null || currentSelectedId === undefined) {
    return Number(items[0]?.id ?? null)
  }

  const index = items.findIndex(item => item.id === currentSelectedId)
  if (index >= 0) {
    return Number(items[index]?.id ?? null)
  }

  if (removedId !== null && removedId !== undefined) {
    const removedIndex = items.findIndex(item => item.id === removedId)
    if (removedIndex >= 0) {
      return Number(items[removedIndex]?.id ?? null)
    }

    const fallbackIndex = Math.min(items.length - 1, Math.max(0, removedIndex))
    return Number(items[fallbackIndex]?.id ?? null)
  }

  return Number(items[0]?.id ?? null)
}

export function buildClipboardWritePayload(
  item: PluginClipboardItem,
  detailImageSrc: string | null,
): { text?: string; html?: string; image?: string; files?: string[] } | null {
  if (item.type === 'image') {
    return detailImageSrc ? { image: detailImageSrc } : null
  }

  if (item.type === 'files') {
    const files = parseFileList(item.content)
    return files.length > 0 ? { files } : null
  }

  return {
    text: item.content,
    html: item.rawContent ?? undefined,
  }
}
