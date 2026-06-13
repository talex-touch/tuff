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

export interface ClipboardTextInsight {
  characterTokens: string[]
  wordTokens: string[]
  characterCount: number
  wordCount: number
  lineCount: number
}

export interface ClipboardColorToken {
  value: string
  label: string
}

export interface ClipboardOcrInsight {
  status: string | null
  statusLabel: string
  text: string | null
  excerpt: string | null
  displayText: string | null
  language: string | null
  confidence: string | null
  keywords: string[]
}

export interface ClipboardImagePreviewState {
  src: string | null
  isThumbnailOnly: boolean
}

interface GraphemeSegmenter {
  segment: (input: string) => Iterable<{ segment: string }>
}

interface WordSegmenter {
  segment: (input: string) => Iterable<{ segment: string; isWordLike?: boolean }>
}

interface IntlWithSegmenter {
  Segmenter?: new (
    locale: string,
    options: { granularity: 'grapheme' } | { granularity: 'word' }
  ) => GraphemeSegmenter | WordSegmenter
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

function parseMetadata(metadata: string | null | undefined): Record<string, unknown> {
  if (!metadata) {
    return {}
  }

  try {
    const parsed = JSON.parse(metadata)
    return isRecord(parsed) ? parsed : {}
  }
  catch {
    return {}
  }
}

function getMeta(item: PluginClipboardItem): Record<string, unknown> {
  return {
    ...parseMetadata(item.metadata),
    ...(isRecord(item.meta) ? item.meta : {}),
  }
}

function unique<T>(values: T[], getKey: (value: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []

  for (const value of values) {
    const key = getKey(value)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(value)
  }

  return result
}

function normalizeHexColor(value: string): string {
  const hex = value.replace('#', '').trim()
  if (hex.length === 3) {
    return `#${hex.split('').map(char => `${char}${char}`).join('')}`.toUpperCase()
  }
  return `#${hex}`.toUpperCase()
}

function isValidRgbPart(value: string): boolean {
  const next = Number(value)
  return Number.isFinite(next) && next >= 0 && next <= 255
}

function normalizeRgbColor(value: string): string | null {
  const parts = value.match(/\d+(?:\.\d+)?/g)
  if (!parts || parts.length < 3 || !parts.slice(0, 3).every(isValidRgbPart)) {
    return null
  }

  const channels = parts.slice(0, 3).map(part => Math.round(Number(part)))
  const alpha = parts[3] === undefined ? null : Number(parts[3])
  if (alpha === null) {
    return `rgb(${channels.join(', ')})`
  }
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    return null
  }

  return `rgba(${channels.join(', ')}, ${Number(alpha.toFixed(3))})`
}

function normalizeColorToken(value: string): ClipboardColorToken | null {
  const trimmed = value.trim()
  const hexMatch = trimmed.match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
  if (hexMatch) {
    const color = normalizeHexColor(hexMatch[1] ?? trimmed)
    return {
      value: color,
      label: color,
    }
  }

  const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i)
  if (rgbMatch) {
    const color = normalizeRgbColor(trimmed)
    return color ? { value: color, label: color } : null
  }

  return null
}

function collectStringValues(value: unknown, maxDepth = 2): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  if (Array.isArray(value) && maxDepth > 0) {
    return value.flatMap(item => collectStringValues(item, maxDepth - 1))
  }
  if (isRecord(value) && maxDepth > 0) {
    return Object.values(value).flatMap(item => collectStringValues(item, maxDepth - 1))
  }

  return []
}

function extractColorTokensFromText(text: string): ClipboardColorToken[] {
  const tokens: ClipboardColorToken[] = []
  const colorPattern = /#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\([^)]+\)/gi
  const matches = text.match(colorPattern) ?? []

  for (const match of matches) {
    const token = normalizeColorToken(match)
    if (token) {
      tokens.push(token)
    }
  }

  return tokens
}

function getImageSize(item: PluginClipboardItem): { width: number; height: number } | null {
  const meta = getMeta(item)
  const raw = meta.image_size ?? meta.imageSize
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
  const size = Number(meta.image_file_size ?? meta.imageFileSize)
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

  return resolveLightweightImagePreview(item).src
}

export function resolveDetailImageSrc(item: PluginClipboardItem | null | undefined): string | null {
  return resolveDetailImagePreview(item).src
}

export function resolveDetailImagePreview(
  item: PluginClipboardItem | null | undefined,
  resolvedOriginalUrl?: string | null,
): ClipboardImagePreviewState {
  if (!item || item.type !== 'image') {
    return {
      src: null,
      isThumbnailOnly: false,
    }
  }

  if (isRenderableImageUrl(resolvedOriginalUrl)) {
    return {
      src: resolvedOriginalUrl,
      isThumbnailOnly: false,
    }
  }

  const meta = getMeta(item)
  const originalUrl = readMetaString(meta, 'image_original_url', 'imageOriginalUrl')
  if (isRenderableImageUrl(originalUrl)) {
    return {
      src: originalUrl,
      isThumbnailOnly: false,
    }
  }

  const contentKind = readMetaString(meta, 'image_content_kind', 'imageContentKind') ?? ''
  if (contentKind !== 'thumbnail' && isRenderableImageUrl(item.content) && item.content !== item.thumbnail) {
    return {
      src: item.content,
      isThumbnailOnly: false,
    }
  }

  const previewUrl = readMetaString(meta, 'image_preview_url', 'imagePreviewUrl')
  if (isRenderableImageUrl(previewUrl)) {
    return {
      src: previewUrl,
      isThumbnailOnly: false,
    }
  }

  return resolveLightweightImagePreview(item)
}

function resolveLightweightImagePreview(item: PluginClipboardItem): ClipboardImagePreviewState {
  if (isRenderableImageUrl(item.thumbnail)) {
    return {
      src: item.thumbnail,
      isThumbnailOnly: true,
    }
  }

  if (isRenderableImageUrl(item.content)) {
    return {
      src: item.content,
      isThumbnailOnly: true,
    }
  }

  return {
    src: null,
    isThumbnailOnly: false,
  }
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

export function getClipboardTextInsight(item: PluginClipboardItem | null | undefined): ClipboardTextInsight | null {
  if (!item || item.type !== 'text') {
    return null
  }

  const content = item.content ?? ''
  if (!content) {
    return {
      characterTokens: [],
      wordTokens: [],
      characterCount: 0,
      wordCount: 0,
      lineCount: 0,
    }
  }

  const SegmenterCtor = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? (Intl as IntlWithSegmenter).Segmenter
    : null
  const characterSegmenter = SegmenterCtor
    ? new SegmenterCtor('zh-CN', { granularity: 'grapheme' })
    : null
  const wordSegmenter = SegmenterCtor
    ? new SegmenterCtor('zh-CN', { granularity: 'word' })
    : null
  const characters = characterSegmenter
    ? Array.from(characterSegmenter.segment(content), segment => segment.segment)
    : Array.from(content)
  const characterTokens = characters.filter(char => char.trim().length > 0)
  const words = wordSegmenter
    ? Array.from(wordSegmenter.segment(content) as Iterable<{ segment: string; isWordLike?: boolean }>)
        .filter(segment => segment.isWordLike === true || /[\p{L}\p{N}_-]/u.test(segment.segment))
        .map(segment => segment.segment.trim())
        .filter(Boolean)
    : (content.match(/[\p{L}\p{N}_-]+/gu) ?? [])
  const lines = content.length > 0 ? content.split(/\r\n|\r|\n/).length : 0

  return {
    characterTokens: characterTokens.slice(0, 80),
    wordTokens: unique(words, word => word.toLowerCase()).slice(0, 40),
    characterCount: characters.length,
    wordCount: words.length,
    lineCount: lines,
  }
}

export function getClipboardColorTokens(item: PluginClipboardItem | null | undefined): ClipboardColorToken[] {
  if (!item) {
    return []
  }

  const meta = getMeta(item)
  const tokens: ClipboardColorToken[] = []

  if (item.type === 'text') {
    tokens.push(...extractColorTokensFromText(item.content ?? ''))
    if (item.rawContent) {
      tokens.push(...extractColorTokensFromText(item.rawContent))
    }
  }

  const likelyColorKeys = [
    'color',
    'colors',
    'palette',
    'dominant_color',
    'dominantColor',
    'accent_color',
    'accentColor',
    'background_color',
    'backgroundColor',
  ]

  for (const key of likelyColorKeys) {
    const value = meta[key]
    for (const raw of collectStringValues(value)) {
      const direct = normalizeColorToken(raw)
      if (direct) {
        tokens.push(direct)
      }
      else {
        tokens.push(...extractColorTokensFromText(raw))
      }
    }
  }

  return unique(tokens, token => token.value.toLowerCase()).slice(0, 12)
}

export function getClipboardOcrInsight(item: PluginClipboardItem | null | undefined): ClipboardOcrInsight | null {
  if (!item) {
    return null
  }

  const meta = getMeta(item)
  const hasOcr = Object.keys(meta).some(key => key.startsWith('ocr_') || key.startsWith('ocr'))
  if (!hasOcr) {
    return null
  }

  const status = readMetaString(meta, 'ocr_status', 'ocrStatus')
  const text = readMetaString(meta, 'ocr_text', 'ocrText')
  const excerpt = readMetaString(meta, 'ocr_excerpt', 'ocrExcerpt')
  const language = readMetaString(meta, 'ocr_language', 'ocrLanguage')
  const confidence =
    typeof meta.ocr_confidence === 'number'
      ? `${Math.round(meta.ocr_confidence * 100)}%`
      : typeof meta.ocr_confidence === 'string'
        ? meta.ocr_confidence.trim() || null
        : typeof meta.ocrConfidence === 'number'
          ? `${Math.round(meta.ocrConfidence * 100)}%`
          : typeof meta.ocrConfidence === 'string'
            ? meta.ocrConfidence.trim() || null
            : null
  const rawKeywords = Array.isArray(meta.ocr_keywords)
    ? meta.ocr_keywords
    : Array.isArray(meta.ocrKeywords)
      ? meta.ocrKeywords
      : typeof meta.ocr_keywords === 'string'
        ? meta.ocr_keywords.split(',')
        : typeof meta.ocrKeywords === 'string'
          ? meta.ocrKeywords.split(',')
          : []
  const keywords = rawKeywords
    .filter((keyword): keyword is string => typeof keyword === 'string')
    .map(keyword => keyword.trim())
    .filter(Boolean)

  return {
    status,
    statusLabel: formatOcrStatus(status),
    text,
    excerpt,
    displayText: text || excerpt,
    language,
    confidence,
    keywords: unique(keywords, keyword => keyword.toLowerCase()).slice(0, 12),
  }
}

function readMetaString(meta: Record<string, unknown>, snakeKey: string, camelKey: string): string | null {
  const value = meta[snakeKey] ?? meta[camelKey]
  return typeof value === 'string' ? value.trim() || null : null
}

function formatOcrStatus(status: string | null): string {
  switch (status?.toLowerCase()) {
    case 'done':
    case 'success':
    case 'succeeded':
      return '已完成'
    case 'pending':
    case 'queued':
      return '等待识别'
    case 'running':
    case 'processing':
      return '识别中'
    case 'failed':
    case 'error':
      return '识别失败'
    default:
      return status || '未知'
  }
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
  removedIndex?: number | null,
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
    const fallbackIndex = Number.isFinite(removedIndex)
      ? Math.min(items.length - 1, Math.max(0, Number(removedIndex)))
      : 0
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
