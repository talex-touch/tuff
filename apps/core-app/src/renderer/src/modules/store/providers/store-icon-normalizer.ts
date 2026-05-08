import type { ITuffIcon } from '@talex-touch/utils'

export interface NormalizedStoreIcon {
  icon?: string
  iconUrl?: string
}

const ICON_TYPES = new Set(['emoji', 'url', 'file', 'class', 'builtin'])
const ICON_CLASS_PREFIXES = [
  'ri',
  'carbon',
  'mdi',
  'lucide',
  'simple-icons',
  'heroicons',
  'tabler',
  'ph',
  'material-symbols',
  'material-symbols-light'
]

function normalizeUrl(url: string, baseUrl?: string | null): string {
  if (!baseUrl || /^(?:https?:|data:|blob:|file:|tfile:)/i.test(url)) {
    return url
  }

  if (url.startsWith('/')) {
    return new URL(url.replace(/^\//, ''), `${baseUrl.replace(/\/$/, '')}/`).toString()
  }

  return new URL(url, `${baseUrl.replace(/\/$/, '')}/`).toString()
}

function isImageLikePath(value: string): boolean {
  return /\.(?:svg|png|jpe?g|webp|gif|ico)(?:[?#].*)?$/i.test(value)
}

function isUrlLike(value: string): boolean {
  return /^(?:https?:|data:image\/|blob:|file:|tfile:)/i.test(value) || value.startsWith('/')
}

function isIconClass(value: string): boolean {
  return /^i-[\w-]+-[\w-]+/.test(value)
}

function normalizeIconClass(value: string): string | undefined {
  if (isIconClass(value)) return value
  if (/^[\w-]+:[\w-]+/.test(value)) return `i-${value.replace(':', '-')}`
  if (ICON_CLASS_PREFIXES.some((prefix) => value.startsWith(`${prefix}-`))) {
    return `i-${value}`
  }
  return undefined
}

function normalizeIconObject(value: ITuffIcon, baseUrl?: string | null): NormalizedStoreIcon {
  const rawValue = typeof value.value === 'string' ? value.value.trim() : ''
  if (!rawValue || !ICON_TYPES.has(value.type)) {
    return {}
  }

  if (value.type === 'class') {
    const iconClass = normalizeIconClass(rawValue)
    return iconClass ? { icon: iconClass } : {}
  }

  if (value.type === 'url') {
    return { iconUrl: normalizeUrl(rawValue, baseUrl) }
  }

  if (value.type === 'file') {
    return { iconUrl: normalizeUrl(rawValue, baseUrl) }
  }

  return {}
}

export function normalizeStoreIcon(value: unknown, baseUrl?: string | null): NormalizedStoreIcon {
  if (!value) return {}

  if (typeof value === 'object') {
    const icon = value as Partial<ITuffIcon>
    if (typeof icon.type === 'string' && typeof icon.value === 'string') {
      return normalizeIconObject(icon as ITuffIcon, baseUrl)
    }
    return {}
  }

  if (typeof value !== 'string') return {}

  const rawValue = value.trim()
  if (!rawValue) return {}

  if (isUrlLike(rawValue) || isImageLikePath(rawValue)) {
    return { iconUrl: normalizeUrl(rawValue, baseUrl) }
  }

  const iconClass = normalizeIconClass(rawValue)
  return iconClass ? { icon: iconClass } : {}
}
