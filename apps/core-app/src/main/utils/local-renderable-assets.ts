import type { ITuffIcon, TuffItem } from '@talex-touch/utils'
import fs from 'node:fs'
import { isHttpSource, resolveLocalFilePath, toTfileUrl } from '@talex-touch/utils/network'

const IMAGE_FALLBACK_ICON = 'i-ri-image-line'
const FILE_FALLBACK_ICON = 'i-ri-file-line'
const FOLDER_FALLBACK_ICON = 'i-ri-folder-line'

export type LocalAssetFallbackKind = 'image' | 'file' | 'folder'

export interface NormalizeLocalAssetResult {
  value: string
  localPath?: string
  changed: boolean
}

export interface MissingLocalAssetResult {
  value: null
  localPath?: string
  missing: true
}

export type NormalizeRenderableSourceResult = NormalizeLocalAssetResult | MissingLocalAssetResult

function isDataUrl(value: string): boolean {
  return value.startsWith('data:')
}

function isPassThroughUrl(value: string): boolean {
  return isDataUrl(value) || isHttpSource(value) || value.startsWith('blob:')
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

export function fallbackIcon(kind: LocalAssetFallbackKind = 'file'): ITuffIcon {
  const value =
    kind === 'image'
      ? IMAGE_FALLBACK_ICON
      : kind === 'folder'
        ? FOLDER_FALLBACK_ICON
        : FILE_FALLBACK_ICON
  return { type: 'class', value }
}

export function normalizeRenderableSource(source: string): NormalizeRenderableSourceResult {
  const raw = typeof source === 'string' ? source.trim() : ''
  if (!raw) {
    return { value: '', changed: raw !== source }
  }

  if (isPassThroughUrl(raw)) {
    return { value: raw, changed: raw !== source }
  }

  const localPath = resolveLocalFilePath(raw)
  if (!localPath) {
    return { value: raw, changed: raw !== source }
  }

  if (!fileExists(localPath)) {
    return {
      value: null,
      localPath,
      missing: true
    }
  }

  const normalizedUrl = toTfileUrl(localPath)
  return {
    value: normalizedUrl,
    localPath,
    changed: normalizedUrl !== source
  }
}

export function normalizeResultFilePath(filePath: string): NormalizeRenderableSourceResult {
  return normalizeRenderableSource(filePath)
}

export function normalizeRenderableIcon(
  icon: ITuffIcon | undefined,
  fallbackKind: LocalAssetFallbackKind = 'file'
): { icon?: ITuffIcon; missingLocalPath?: string; changed: boolean } {
  if (!icon?.value) {
    return { icon, changed: false }
  }

  if (icon.type !== 'url' && icon.type !== 'file') {
    return { icon, changed: false }
  }

  const normalized = normalizeRenderableSource(icon.value)
  if ('missing' in normalized) {
    return {
      icon: fallbackIcon(fallbackKind),
      missingLocalPath: normalized.localPath,
      changed: true
    }
  }

  if (!normalized.changed && icon.type === 'url') {
    return { icon, changed: false }
  }

  return {
    icon: {
      ...icon,
      type: 'url',
      value: normalized.value
    },
    changed: true
  }
}

export function normalizeRenderablePreviewImage(image: string | undefined): {
  image?: string
  missingLocalPath?: string
  changed: boolean
} {
  if (!image) {
    return { image, changed: false }
  }

  const normalized = normalizeRenderableSource(image)
  if ('missing' in normalized) {
    return {
      image: undefined,
      missingLocalPath: normalized.localPath,
      changed: true
    }
  }

  return {
    image: normalized.value,
    changed: normalized.changed
  }
}

export function normalizeTuffItemLocalAssets(
  item: TuffItem,
  options: {
    fallbackKind?: LocalAssetFallbackKind
    dropMissingFile?: boolean
  } = {}
): { item: TuffItem | null; missingPaths: string[]; changed: boolean } {
  const missingPaths: string[] = []
  let changed = false

  if (options.dropMissingFile) {
    const filePath = item.meta?.file?.path
    if (typeof filePath === 'string' && filePath.trim()) {
      const normalizedPath = normalizeResultFilePath(filePath)
      if ('missing' in normalizedPath) {
        return {
          item: null,
          missingPaths: [normalizedPath.localPath ?? filePath],
          changed: true
        }
      }
    }
  }

  const nextItem: TuffItem = { ...item, render: { ...item.render } }
  const fallbackKind =
    options.fallbackKind ??
    (item.kind === 'folder' ? 'folder' : item.kind === 'image' ? 'image' : 'file')

  if (item.render.basic) {
    const normalizedIcon = normalizeRenderableIcon(item.render.basic.icon, fallbackKind)
    if (normalizedIcon.missingLocalPath) {
      missingPaths.push(normalizedIcon.missingLocalPath)
    }
    if (normalizedIcon.changed) {
      changed = true
      nextItem.render.basic = {
        ...item.render.basic,
        icon: normalizedIcon.icon
      }
    }
  }

  if (item.render.preview?.image) {
    const normalizedPreview = normalizeRenderablePreviewImage(item.render.preview.image)
    if (normalizedPreview.missingLocalPath) {
      missingPaths.push(normalizedPreview.missingLocalPath)
    }
    if (normalizedPreview.changed) {
      changed = true
      nextItem.render.preview = {
        ...item.render.preview,
        image: normalizedPreview.image
      }
    }
  }

  return {
    item: changed ? nextItem : item,
    missingPaths,
    changed
  }
}
