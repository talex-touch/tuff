import type { ImagePreviewItem } from './types'
import type { PreviewSize } from './zoom'

// What the toolbar's and the menu's actions do with a picture, once the host has let them. Each
// starts its browser call before it awaits anything: Safari keeps a clipboard write or a share
// sheet only inside the click that asked for it.

/** The picture went onto the clipboard, only its link did, or nothing did. */
export type CopyOutcome = 'image' | 'link' | 'failed'

export type ShareOutcome = 'shared' | 'cancelled' | 'failed'

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
}

function parse(url: string | undefined): URL | null {
  if (!url)
    return null
  try {
    return new URL(url, typeof document !== 'undefined' ? document.baseURI : undefined)
  }
  catch {
    return null
  }
}

/** Served by this page's origin: its bytes can be read, and a link's `download` holds. */
function isSameOrigin(url: URL): boolean {
  return typeof location !== 'undefined' && url.origin === location.origin
}

/** `type` of a data: URL, read off its header. */
function dataType(url: string): string {
  return /^data:([^;,]*)/i.exec(url)?.[1]?.toLowerCase() ?? ''
}

/** A data: URL's bytes, decoded at once rather than fetched, so a share still runs inside its click. */
function dataBlob(url: string): Blob {
  const comma = url.indexOf(',')
  const header = url.slice(0, comma)
  const body = url.slice(comma + 1)
  const type = dataType(url)
  if (/;base64$/i.test(header)) {
    const binary = atob(body)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++)
      bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type })
  }
  return new Blob([decoded(body)], { type })
}

function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment)
  }
  catch {
    return segment
  }
}

/** The picture's name to save it under: the item's, or the URL's last segment, with an extension its type gives. */
export function pictureFileName(item: Pick<ImagePreviewItem, 'url' | 'name'>, type = ''): string {
  const url = parse(item.url)
  const segment = url && url.protocol !== 'data:' && url.protocol !== 'blob:'
    ? decoded(url.pathname.split('/').pop() ?? '')
    : ''
  const base = (item.name?.trim() || segment || 'image').replace(/[\\/:*?"<>|]+/g, '-')
  if (/\.[a-z0-9]{2,5}$/i.test(base))
    return base
  const extension = EXTENSIONS[type.toLowerCase()] ?? /\.([a-z0-9]{2,5})$/i.exec(segment)?.[1]
  return extension ? `${base}.${extension}` : base
}

function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  const image = new Image()
  if (crossOrigin)
    image.crossOrigin = 'anonymous'
  image.src = src
  return image.decode().then(() => image)
}

/**
 * The picture as PNG, the one image type every clipboard takes, drawn into a canvas and read
 * back. Nothing is fetched: network access in this library goes through a client the host
 * injects. A data: picture is decoded in place; one from this page, or a blob:, is the copy the
 * browser already holds for the preview; one from another site loads again in CORS mode, the one
 * way to read its pixels, and fails where that site does not allow it.
 */
async function pngBlob(url: string, size?: PreviewSize): Promise<Blob> {
  const parsed = parse(url)
  if (!parsed)
    throw new Error('The image has no URL')
  if (parsed.protocol === 'data:' && dataType(parsed.href) === 'image/png')
    return dataBlob(parsed.href)
  const local = parsed.protocol === 'data:' || parsed.protocol === 'blob:'
  const image = await loadImage(parsed.href, !local && !isSameOrigin(parsed))
  // An SVG without a size of its own reports none: it is drawn at the size the preview gave it.
  const width = image.naturalWidth || Math.round(size?.width ?? 0)
  const height = image.naturalHeight || Math.round(size?.height ?? 0)
  if (!(width > 0 && height > 0))
    throw new Error('The image has no size to draw at')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('No 2D canvas')
  context.drawImage(image, 0, 0, width, height)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(png => (png ? resolve(png) : reject(new Error('The canvas could not be read'))), 'image/png')
  })
}

/**
 * Puts the picture on the clipboard, or its link where the picture cannot go: a browser without
 * image clipboards, or a picture from a site that keeps its pixels to itself.
 */
export async function copyImage(url: string, size?: PreviewSize): Promise<CopyOutcome> {
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
  if (clipboard?.write && typeof ClipboardItem !== 'undefined') {
    // The item is made at once with the blob still to come: the write belongs to this click.
    const png = pngBlob(url, size)
    png.catch(() => {})
    try {
      await clipboard.write([new ClipboardItem({ 'image/png': png })])
      return 'image'
    }
    catch {}
  }
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(parse(url)?.href ?? url)
      return 'link'
    }
    catch {}
  }
  return 'failed'
}

/** Whether this browser has a share sheet. */
export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/**
 * Opens the share sheet: a picture on the web goes as its link, which the sheet can hand on at
 * once; a data: or blob: picture, whose link means nothing elsewhere, goes as a file.
 */
export async function shareImage(item: ImagePreviewItem): Promise<ShareOutcome> {
  const url = parse(item.url)
  if (!canShare() || !url)
    return 'failed'
  try {
    let data: ShareData
    if (url.protocol === 'data:' || url.protocol === 'blob:') {
      // eslint-disable-next-line no-restricted-syntax -- reads a blob: URL, bytes already in this page; no network request.
      const blob = url.protocol === 'data:' ? dataBlob(url.href) : await (await fetch(url.href)).blob()
      data = { files: [new File([blob], pictureFileName(item, blob.type), { type: blob.type })] }
      if (item.name)
        data.title = item.name
      if (typeof navigator.canShare === 'function' && !navigator.canShare(data))
        return 'failed'
    }
    else {
      data = { url: url.href }
      if (item.name)
        data.title = item.name
    }
    await navigator.share(data)
    return 'shared'
  }
  catch (error) {
    return error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}

function follow(href: string, attributes: { download?: string, target?: string }): void {
  const link = document.createElement('a')
  link.href = href
  if (attributes.download !== undefined)
    link.download = attributes.download
  if (attributes.target) {
    link.target = attributes.target
    link.rel = 'noopener'
  }
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/**
 * Saves the picture. One this page can read is saved under its name; one from another site,
 * whose link ignores `download`, opens on its own in this click instead, where no popup blocker
 * stops it.
 */
export function downloadImage(item: ImagePreviewItem): void {
  const url = parse(item.url)
  if (!url || typeof document === 'undefined')
    return
  if (url.protocol === 'data:' || url.protocol === 'blob:') {
    follow(url.href, { download: pictureFileName(item, url.protocol === 'data:' ? dataType(url.href) : '') })
    return
  }
  if (!isSameOrigin(url)) {
    follow(url.href, { target: '_blank' })
    return
  }
  follow(url.href, { download: pictureFileName(item) })
}
