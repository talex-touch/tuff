import type { IconChipTone } from '../../icon-chip/src/types'

export interface AttachmentFileBadge {
  label: string
  tone: IconChipTone
}

const EXT_TONE: Record<string, IconChipTone> = {
  pdf: 'red',
  csv: 'green',
  xls: 'green',
  xlsx: 'green',
  numbers: 'green',
  doc: 'accent',
  docx: 'accent',
  md: 'accent',
  markdown: 'accent',
  pages: 'accent',
  rtf: 'accent',
  zip: 'orange',
  tar: 'orange',
  gz: 'orange',
  tgz: 'orange',
  rar: 'orange',
  '7z': 'orange',
  ppt: 'orange',
  pptx: 'orange',
  key: 'orange',
  json: 'ink',
  ts: 'ink',
  tsx: 'ink',
  js: 'ink',
  jsx: 'ink',
  vue: 'ink',
  yml: 'ink',
  yaml: 'ink',
  xml: 'ink',
  html: 'ink',
  css: 'ink',
  scss: 'ink',
  py: 'ink',
  rs: 'ink',
  go: 'ink',
  sh: 'ink',
  sql: 'ink',
}

const LABEL_ALIAS: Record<string, string> = {
  markdown: 'MD',
  numbers: 'XLS',
  pages: 'DOC',
  yaml: 'YML',
}

function extensionFromName(name: string): string {
  const trimmed = name.trim()
  const dot = trimmed.lastIndexOf('.')
  if (dot <= 0 || dot === trimmed.length - 1)
    return ''
  const ext = trimmed.slice(dot + 1).toLowerCase()
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : ''
}

function extensionFromMime(mime?: string): string {
  if (!mime)
    return ''
  const lower = mime.toLowerCase().split(';')[0]!.trim()
  if (lower === 'application/pdf')
    return 'pdf'
  if (lower === 'text/csv')
    return 'csv'
  if (lower === 'text/markdown')
    return 'md'
  if (lower === 'text/plain')
    return 'txt'
  if (lower === 'application/json')
    return 'json'
  if (lower === 'application/zip' || lower === 'application/x-zip-compressed')
    return 'zip'
  return ''
}

export function resolveAttachmentFileBadge(name: string, mime?: string): AttachmentFileBadge | null {
  const ext = extensionFromName(name) || extensionFromMime(mime)
  if (!ext)
    return null
  const label = LABEL_ALIAS[ext] ?? ext.slice(0, 4).toUpperCase()
  const tone = EXT_TONE[ext] ?? 'neutral'
  return { label, tone }
}
