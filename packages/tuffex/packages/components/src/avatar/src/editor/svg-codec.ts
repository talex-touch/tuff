import type { AvatarShape } from '../types'
import type { AvatarEditorTransform } from './types'
import { buildCanvasFilter, computeTransformMetrics, resolveMaskRadius } from './geometry'

export interface ParsedSvgSource {
  width: number
  height: number
  viewBoxMinX: number
  viewBoxMinY: number
  viewBoxWidth: number
  viewBoxHeight: number
  innerMarkup: string
  /** Sanitized presentation attributes inherited from the root `<svg>` element. */
  rootAttributes?: Record<string, string>
  /** False when root `<svg>` carries styling/filters/classes that cannot be faithfully preserved on an inner `<g>`. */
  preservesRootStyling?: boolean
}

const DANGEROUS_TAGS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed'])

const ROOT_PRESENTATION_ATTRS = new Set([
  'color',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'paint-order',
  'shape-rendering',
  'vector-effect',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
])

const UNPRESERVABLE_ROOT_ATTRS = new Set([
  'class',
  'style',
  'filter',
  'mask',
  'clip-path',
])

function isSafeSvgAttrValue(value: string): boolean {
  const lower = value.trim().toLowerCase()
  if (!lower)
    return false
  if (lower.includes('javascript:') || lower.includes('expression('))
    return false
  if (/\burl\s*\(/i.test(lower))
    return /^url\(\s*['"]?#[a-z0-9_-]+['"]?\s*\)$/i.test(lower)
  return true
}

function extractRootPresentationAttrsFromMap(
  entries: Iterable<readonly [string, string]>,
): { rootAttributes: Record<string, string>, preservesRootStyling: boolean } {
  const rootAttributes: Record<string, string> = {}
  let preservesRootStyling = true
  for (const [rawName, rawValue] of entries) {
    const name = rawName.toLowerCase()
    const value = rawValue.trim()
    if (!value)
      continue
    if (UNPRESERVABLE_ROOT_ATTRS.has(name)) {
      preservesRootStyling = false
      continue
    }
    if (ROOT_PRESENTATION_ATTRS.has(name)) {
      if (isSafeSvgAttrValue(value))
        rootAttributes[name] = value
      else
        preservesRootStyling = false
    }
  }
  return { rootAttributes, preservesRootStyling }
}

function parseTagAttributesRegex(attrSource: string): [string, string][] {
  const pairs: [string, string][] = []
  const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null = attrRe.exec(attrSource)
  while (match) {
    const name = match[1]!
    const value = match[2] ?? match[3] ?? ''
    pairs.push([name, value])
    match = attrRe.exec(attrSource)
  }
  return pairs
}

function parsePositiveLength(raw: string | null | undefined): number | null {
  if (!raw)
    return null
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i)
  if (!match)
    return null
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : null
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function stripDangerousRegex(markup: string): string {
  return markup
    .replace(/<\s*(script|foreignObject|iframe|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|foreignObject|iframe|object|embed)\b[^>]*\/\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(?:href|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '')
}

/**
 * Parses and sanitizes an uploaded SVG document so it can be safely re-wrapped
 * with vector crop/rotation/flip transforms without executing embedded scripts.
 */
export function parseAndSanitizeSvg(rawSvg: string): ParsedSvgSource | null {
  const trimmed = rawSvg.trim()
  if (!trimmed || !/<svg\b/i.test(trimmed))
    return null

  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(trimmed, 'image/svg+xml')
      const root = doc.documentElement
      if (root && root.tagName.toLowerCase() === 'svg' && !doc.querySelector('parsererror')) {
        const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
        const toRemove: Element[] = []
        let current = walker.nextNode() as Element | null
        while (current) {
          if (DANGEROUS_TAGS.has(current.tagName.toLowerCase())) {
            toRemove.push(current)
          }
          else {
            for (const attr of Array.from(current.attributes)) {
              const name = attr.name.toLowerCase()
              const val = attr.value.trim().toLowerCase()
              if (name.startsWith('on'))
                current.removeAttribute(attr.name)
              else if ((name === 'href' || name === 'xlink:href') && val.startsWith('javascript:'))
                current.removeAttribute(attr.name)
            }
          }
          current = walker.nextNode() as Element | null
        }
        for (const el of toRemove)
          el.remove()

        const vbRaw = root.getAttribute('viewBox')
        let vbMinX = 0
        let vbMinY = 0
        let vbW = 0
        let vbH = 0
        if (vbRaw) {
          const parts = vbRaw.trim().split(/[\s,]+/).map(Number)
          if (parts.length === 4 && parts.every(Number.isFinite) && parts[2]! > 0 && parts[3]! > 0) {
            vbMinX = parts[0]!
            vbMinY = parts[1]!
            vbW = parts[2]!
            vbH = parts[3]!
          }
        }

        const attrW = parsePositiveLength(root.getAttribute('width'))
        const attrH = parsePositiveLength(root.getAttribute('height'))
        const width = vbW > 0 ? vbW : (attrW ?? 512)
        const height = vbH > 0 ? vbH : (attrH ?? 512)

        const { rootAttributes, preservesRootStyling } = extractRootPresentationAttrsFromMap(
          Array.from(root.attributes, attr => [attr.name, attr.value] as const),
        )

        const serializer = new XMLSerializer()
        const innerMarkup = Array.from(root.childNodes)
          .map(node => serializer.serializeToString(node))
          .join('')

        return {
          width,
          height,
          viewBoxMinX: vbW > 0 ? vbMinX : 0,
          viewBoxMinY: vbH > 0 ? vbMinY : 0,
          viewBoxWidth: width,
          viewBoxHeight: height,
          innerMarkup,
          rootAttributes,
          preservesRootStyling,
        }
      }
    }
    catch {
      // Fall through to lightweight text parser below.
    }
  }

  const openMatch = trimmed.match(/<svg\b([^>]*)>/i)
  const closeIdx = trimmed.toLowerCase().lastIndexOf('</svg>')
  if (!openMatch || closeIdx < 0)
    return null

  const attrs = openMatch[1] ?? ''
  const innerRaw = trimmed.slice((openMatch.index ?? 0) + openMatch[0].length, closeIdx)
  const innerMarkup = stripDangerousRegex(innerRaw)

  const vbMatch = attrs.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)
  let vbMinX = 0
  let vbMinY = 0
  let vbW = 0
  let vbH = 0
  if (vbMatch?.[1]) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2]! > 0 && parts[3]! > 0) {
      vbMinX = parts[0]!
      vbMinY = parts[1]!
      vbW = parts[2]!
      vbH = parts[3]!
    }
  }

  const wMatch = attrs.match(/\bwidth\s*=\s*["']([^"']+)["']/i)
  const hMatch = attrs.match(/\bheight\s*=\s*["']([^"']+)["']/i)
  const width = vbW > 0 ? vbW : (parsePositiveLength(wMatch?.[1]) ?? 512)
  const height = vbH > 0 ? vbH : (parsePositiveLength(hMatch?.[1]) ?? 512)

  const { rootAttributes, preservesRootStyling } = extractRootPresentationAttrsFromMap(
    parseTagAttributesRegex(attrs),
  )

  return {
    width,
    height,
    viewBoxMinX: vbW > 0 ? vbMinX : 0,
    viewBoxMinY: vbH > 0 ? vbMinY : 0,
    viewBoxWidth: width,
    viewBoxHeight: height,
    innerMarkup,
    rootAttributes,
    preservesRootStyling,
  }
}

function buildClipDef(shape: AvatarShape, size: number, id: string): string {
  if (shape === 'circle') {
    const r = size / 2
    return `<clipPath id="${id}"><circle cx="${r}" cy="${r}" r="${r}" /></clipPath>`
  }
  const radius = resolveMaskRadius(shape, size)
  if (radius > 0)
    return `<clipPath id="${id}"><rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" /></clipPath>`
  return `<clipPath id="${id}"><rect x="0" y="0" width="${size}" height="${size}" /></clipPath>`
}

/**
 * Produces a pure vector SVG preserving the original vector paths with the exact
 * crop, pan, zoom, rotation, flip, background, and mask clip applied.
 */
export function buildVectorAvatarSvg(
  parsed: ParsedSvgSource,
  transform: AvatarEditorTransform,
  shape: AvatarShape,
  outSize: number,
): string {
  const safeSize = Math.max(16, Math.round(outSize))
  const metrics = computeTransformMetrics(
    { width: parsed.viewBoxWidth, height: parsed.viewBoxHeight },
    transform,
    safeSize,
  )

  const sx = (transform.flipX ? -1 : 1) * metrics.drawScale
  const sy = (transform.flipY ? -1 : 1) * metrics.drawScale
  const originX = -(parsed.viewBoxMinX + parsed.viewBoxWidth / 2)
  const originY = -(parsed.viewBoxMinY + parsed.viewBoxHeight / 2)
  const transformAttr = [
    `translate(${metrics.centerX.toFixed(3)} ${metrics.centerY.toFixed(3)})`,
    transform.rotation !== 0 ? `rotate(${transform.rotation})` : '',
    `scale(${sx.toFixed(6)} ${sy.toFixed(6)})`,
    `translate(${originX.toFixed(3)} ${originY.toFixed(3)})`,
  ].filter(Boolean).join(' ')

  const clipId = 'tx-avatar-clip'
  const useClip = transform.maskClip && shape !== 'square'
  const bg = transform.background && transform.background !== 'transparent'
    ? `<rect width="${safeSize}" height="${safeSize}" fill="${escapeXmlAttr(transform.background)}" />`
    : ''

  const cssFilter = buildCanvasFilter(transform)
  const filterStyle = cssFilter !== 'none' ? ` style="filter:${escapeXmlAttr(cssFilter)}"` : ''
  const defs = useClip ? `<defs>${buildClipDef(shape, safeSize, clipId)}</defs>` : ''
  const clipAttr = useClip ? ` clip-path="url(#${clipId})"` : ''
  const inheritedAttrs = Object.entries(parsed.rootAttributes ?? {})
    .filter(([name, value]) => ROOT_PRESENTATION_ATTRS.has(name.toLowerCase()) && isSafeSvgAttrValue(value))
    .map(([name, value]) => ` ${name}="${escapeXmlAttr(value)}"`)
    .join('')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${safeSize} ${safeSize}" width="${safeSize}" height="${safeSize}">`,
    defs,
    `<g${clipAttr}>`,
    bg,
    `<g transform="${transformAttr}"${inheritedAttrs}${filterStyle}>`,
    parsed.innerMarkup,
    '</g>',
    '</g>',
    '</svg>',
  ].filter(Boolean).join('')
}

/**
 * Wraps a rendered raster PNG data URL into a clean self-contained SVG container,
 * optionally applying the vector avatar clip mask.
 */
export function buildRasterAvatarSvg(
  pngDataUrl: string,
  shape: AvatarShape,
  maskClip: boolean,
  outSize: number,
  background?: string,
): string {
  const safeSize = Math.max(16, Math.round(outSize))
  const clipId = 'tx-avatar-clip'
  const useClip = maskClip && shape !== 'square'
  const defs = useClip ? `<defs>${buildClipDef(shape, safeSize, clipId)}</defs>` : ''
  const clipAttr = useClip ? ` clip-path="url(#${clipId})"` : ''
  const bg = background && background !== 'transparent'
    ? `<rect width="${safeSize}" height="${safeSize}" fill="${escapeXmlAttr(background)}" />`
    : ''

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${safeSize} ${safeSize}" width="${safeSize}" height="${safeSize}">`,
    defs,
    `<g${clipAttr}>`,
    bg,
    `<image href="${escapeXmlAttr(pngDataUrl)}" x="0" y="0" width="${safeSize}" height="${safeSize}" preserveAspectRatio="xMidYMid slice" />`,
    '</g>',
    '</svg>',
  ].filter(Boolean).join('')
}
