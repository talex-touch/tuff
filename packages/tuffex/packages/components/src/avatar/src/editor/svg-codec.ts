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

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/'

const ALLOWED_SVG_TAGS = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'title',
  'desc',
  'metadata',
  'clippath',
  'mask',
  'pattern',
  'marker',
  'switch',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textpath',
  'lineargradient',
  'radialgradient',
  'stop',
  'filter',
  'feblend',
  'fecolormatrix',
  'fecomponenttransfer',
  'fecomposite',
  'feconvolvematrix',
  'fediffuselighting',
  'fedisplacementmap',
  'fedistantlight',
  'fedropshadow',
  'feflood',
  'fefunca',
  'fefuncb',
  'fefuncg',
  'fefuncr',
  'fegaussianblur',
  'feimage',
  'femerge',
  'femergenode',
  'femorphology',
  'feoffset',
  'fepointlight',
  'fespecularlighting',
  'fespotlight',
  'fetile',
  'feturbulence',
  'image',
])

const BLOCKED_ATTR_LOCAL_NAMES = new Set([
  'style',
  'src',
  'srcdoc',
  'action',
  'formaction',
  'actuate',
  'show',
  'role',
  'arcrole',
  'attributename',
  'to',
  'from',
  'by',
])

const ALLOWED_ATTR_NAMESPACES = new Set([
  '',
  SVG_NS,
  XLINK_NS,
  XML_NS,
  XMLNS_NS,
])

const SAFE_FRAGMENT_HREF_RE = /^#[a-z_][\w:-]*$/i
const SAFE_RASTER_DATA_URI_RE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1F || code === 0x7F)
      return true
  }
  return false
}

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

function stripControlAndWhitespace(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code > 0x1F && code !== 0x7F && !/\s/.test(char)
    })
    .join('')
}

function isSafeSvgHref(value: string, elementLocalName: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || hasControlChar(trimmed))
    return false
  if (SAFE_FRAGMENT_HREF_RE.test(trimmed))
    return true
  if ((elementLocalName === 'image' || elementLocalName === 'feimage') && SAFE_RASTER_DATA_URI_RE.test(trimmed))
    return true
  return false
}

function isSafeSvgAttrValue(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed)
    return false
  if (hasControlChar(trimmed))
    return false
  const compactLower = stripControlAndWhitespace(trimmed).toLowerCase()
  if (
    compactLower.includes('javascript:')
    || compactLower.includes('vbscript:')
    || compactLower.includes('expression(')
    || compactLower.includes('@import')
  ) {
    return false
  }
  const lower = trimmed.toLowerCase()
  if (/\burl\s*\(/i.test(lower))
    return /^url\(\s*['"]?#[a-z_][\w:-]*['"]?\s*\)$/i.test(lower)
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

function hasXmlParserError(doc: Document): boolean {
  if (doc.querySelector('parsererror'))
    return true
  if (doc.getElementsByTagName('parsererror').length > 0)
    return true
  if (typeof doc.getElementsByTagNameNS === 'function' && doc.getElementsByTagNameNS('*', 'parsererror').length > 0)
    return true
  return false
}

/**
 * Parses and sanitizes an uploaded SVG document so it can be safely re-wrapped
 * with vector crop/rotation/flip transforms without executing embedded scripts.
 *
 * Fails closed (`null`) when DOMParser/XMLSerializer is unavailable or when the
 * SVG document is malformed XML (never falls back to regex stripping).
 */
export function parseAndSanitizeSvg(rawSvg: string): ParsedSvgSource | null {
  const trimmed = rawSvg.trim()
  if (!trimmed || !/<svg\b/i.test(trimmed))
    return null

  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined')
    return null

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(trimmed, 'image/svg+xml')
    const root = doc.documentElement
    if (!root || hasXmlParserError(doc))
      return null

    const rootLocalName = (root.localName || root.tagName.split(':').pop() || '').toLowerCase()
    if (rootLocalName !== 'svg')
      return null
    if (root.namespaceURI && root.namespaceURI !== SVG_NS)
      return null

    const walker = doc.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_PROCESSING_INSTRUCTION,
    )
    const toRemove: ChildNode[] = []
    let droppedStyling = false
    let current = walker.nextNode()
    while (current) {
      if (current.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
        toRemove.push(current as ChildNode)
      }
      else if (current.nodeType === Node.ELEMENT_NODE) {
        const el = current as Element
        const localName = (el.localName || el.tagName.split(':').pop() || '').toLowerCase()
        const validNamespace = !el.namespaceURI || el.namespaceURI === SVG_NS
        if (!validNamespace || !ALLOWED_SVG_TAGS.has(localName)) {
          if (localName === 'style')
            droppedStyling = true
          toRemove.push(el)
        }
        else {
          for (const attr of Array.from(el.attributes)) {
            const attrNameLower = attr.name.toLowerCase()
            const attrLocalName = (attr.localName || attr.name.split(':').pop() || '').toLowerCase()
            const attrNs = attr.namespaceURI ?? ''

            if (attrNameLower === 'xmlns' || attrNameLower.startsWith('xmlns:')) {
              const allowedXmlns = (attrNameLower === 'xmlns' && attr.value.trim() === SVG_NS)
                || (attrNameLower === 'xmlns:xlink' && attr.value.trim() === XLINK_NS)
              if (!allowedXmlns)
                el.removeAttribute(attr.name)
              continue
            }

            if (!ALLOWED_ATTR_NAMESPACES.has(attrNs)) {
              el.removeAttribute(attr.name)
              continue
            }

            if (attrLocalName.startsWith('on') || BLOCKED_ATTR_LOCAL_NAMES.has(attrLocalName)) {
              if (attrLocalName === 'style')
                droppedStyling = true
              el.removeAttribute(attr.name)
              continue
            }

            if (attrLocalName === 'href') {
              if (!isSafeSvgHref(attr.value, localName))
                el.removeAttribute(attr.name)
              continue
            }

            if (attr.value.trim() && !isSafeSvgAttrValue(attr.value)) {
              el.removeAttribute(attr.name)
            }
          }
        }
      }
      current = walker.nextNode()
    }
    for (const node of toRemove)
      node.remove()

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

    const { rootAttributes, preservesRootStyling: rootPreserved } = extractRootPresentationAttrsFromMap(
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
      preservesRootStyling: rootPreserved && !droppedStyling,
    }
  }
  catch {
    return null
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
