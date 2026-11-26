import type { TdsDomProbeOptions, TdsLintIssue } from './types'
import { hasWindow } from '@talex-touch/utils/env'

export type RgbaTuple = [number, number, number, number]
export type RgbTuple = [number, number, number]

const NAMED_COLORS: Record<string, RgbaTuple> = {
  transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 1],
  white: [255, 255, 255, 1],
  red: [255, 0, 0, 1],
  green: [0, 128, 0, 1],
  blue: [0, 0, 255, 1],
  yellow: [255, 255, 0, 1],
  cyan: [0, 255, 255, 1],
  magenta: [255, 0, 255, 1],
  gray: [128, 128, 128, 1],
  grey: [128, 128, 128, 1],
  silver: [192, 192, 192, 1],
  orange: [255, 165, 0, 1],
  purple: [128, 0, 128, 1],
  navy: [0, 0, 128, 1],
  teal: [0, 128, 128, 1],
  maroon: [128, 0, 0, 1],
  olive: [128, 128, 0, 1],
  lime: [0, 255, 0, 1],
  aqua: [0, 255, 255, 1],
  fuchsia: [255, 0, 255, 1]
}

const SKIP_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'META', 'LINK'])

const ICON_CLASS_PATTERN = /(?:^|\s)(?:i-[a-z0-9][a-z0-9-]*|icon-\[[^\]]+\])(?=\s|$)/i
const COMPACT_CONTROL_CLASS_PATTERN = /\b(?:badge|pill|chip|tag|tab|status-badge)\b/i
const CARD_CLASS_PATTERN = /\bcard\b/i
const ICON_TILE_CLASS_PATTERN = /\b(?:icon|tile|avatar|badge|chip|emoji|feature-icon|stat-icon)\b/i
const FLOATING_ROLES = new Set(['dialog', 'alertdialog', 'menu', 'listbox', 'tooltip', 'popover'])
const EMOJI_ONLY_PATTERN =
  /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*){1,2}$/u

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, value))
}

function clampAlpha(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Parses CSS hex, `rgb()`/`rgba()` (comma or CSS Color 4 space syntax), and named colors. */
export function parseCssColor(raw: string | null | undefined): RgbaTuple | null {
  if (!raw) return null
  const normalized = raw.trim().toLowerCase()
  if (
    !normalized ||
    normalized === 'none' ||
    normalized === 'inherit' ||
    normalized === 'initial'
  ) {
    return null
  }
  if (normalized in NAMED_COLORS) {
    const tuple = NAMED_COLORS[normalized]!
    return [tuple[0], tuple[1], tuple[2], tuple[3]]
  }

  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(normalized)
  if (hexMatch) {
    const d = hexMatch[1]!
    if (d.length === 3 || d.length === 4) {
      const r = Number.parseInt(d[0]! + d[0]!, 16)
      const g = Number.parseInt(d[1]! + d[1]!, 16)
      const b = Number.parseInt(d[2]! + d[2]!, 16)
      const a = d.length === 4 ? Number.parseInt(d[3]! + d[3]!, 16) / 255 : 1
      return [r, g, b, a]
    }
    const r = Number.parseInt(d.slice(0, 2), 16)
    const g = Number.parseInt(d.slice(2, 4), 16)
    const b = Number.parseInt(d.slice(4, 6), 16)
    const a = d.length === 8 ? Number.parseInt(d.slice(6, 8), 16) / 255 : 1
    return [r, g, b, a]
  }

  const rgbMatch = /^rgba?\(\s*([^)]+?)\s*\)$/.exec(normalized)
  if (rgbMatch) {
    const body = rgbMatch[1]!
    let channels: string[] = []
    let alphaPart: string | undefined
    if (body.includes(',')) {
      const parts = body.split(',').map((p) => p.trim())
      channels = parts.slice(0, 3)
      alphaPart = parts[3]
    } else {
      const [rgbSide, slashAlpha] = body.split('/')
      channels = (rgbSide ?? '').trim().split(/\s+/).filter(Boolean)
      alphaPart = slashAlpha?.trim()
    }
    if (channels.length < 3) return null
    const parseChannel = (token: string): number => {
      if (token.endsWith('%')) {
        return clampChannel((Number.parseFloat(token) / 100) * 255)
      }
      return clampChannel(Number.parseFloat(token))
    }
    const r = parseChannel(channels[0]!)
    const g = parseChannel(channels[1]!)
    const b = parseChannel(channels[2]!)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
    let a = 1
    if (alphaPart !== undefined && alphaPart !== '') {
      a = alphaPart.endsWith('%')
        ? clampAlpha(Number.parseFloat(alphaPart) / 100)
        : clampAlpha(Number.parseFloat(alphaPart))
      if (Number.isNaN(a)) a = 1
    }
    return [r, g, b, a]
  }

  return null
}

/** Alpha-composites an sRGB foreground `fg` over an opaque background `bg`. */
export function compositeRgbaOverRgb(fg: RgbaTuple, bg: RgbTuple): RgbTuple {
  const [fr, fgCh, fb, fa] = fg
  const [br, bgCh, bb] = bg
  return [fr * fa + br * (1 - fa), fgCh * fa + bgCh * (1 - fa), fb * fa + bb * (1 - fa)]
}

/** WCAG 2.1 sRGB relative luminance (IEC 61966-2-1 threshold 0.04045). */
export function relativeLuminance([r, g, b]: RgbTuple): number {
  const linearize = (channel: number): number => {
    const s = clampChannel(channel) / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

/** WCAG 2.1 contrast ratio between two opaque sRGB colors (`1.0` to `21.0`). */
export function contrastRatioRgb(a: RgbTuple, b: RgbTuple): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

function getOwnerWindow(root: ParentNode): Window | null {
  if ('defaultView' in root) {
    const view = (root as Document).defaultView
    if (view) return view
  }
  if ('ownerDocument' in root) {
    const view = (root as Node).ownerDocument?.defaultView
    if (view) return view
  }
  return hasWindow() ? window : null
}

/**
 * Resolves an element's effective opaque background color by walking its ancestor chain and
 * alpha-compositing every translucent background from outermost ancestor inward.
 */
export function resolveEffectiveBackground(
  el: Element,
  win: Window,
  defaultBackdrop: readonly [number, number, number] = [255, 255, 255]
): RgbTuple {
  const chain: Element[] = []
  let current: Element | null = el
  while (current) {
    chain.push(current)
    current = current.parentElement
  }

  let bg: RgbTuple = [defaultBackdrop[0], defaultBackdrop[1], defaultBackdrop[2]]
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const node = chain[i]!
    const style = win.getComputedStyle(node)
    const parsed = parseCssColor(style.backgroundColor)
    if (!parsed || parsed[3] <= 0) continue
    const op = Number.parseFloat(style.opacity || '1')
    const effAlpha = clampAlpha(parsed[3] * (Number.isNaN(op) ? 1 : op))
    bg = compositeRgbaOverRgb([parsed[0], parsed[1], parsed[2], effAlpha], bg)
  }
  return bg
}

function buildCompactSelector(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const id = el.getAttribute('id')
  if (id) return `${tag}#${id}`
  const classAttr = typeof el.className === 'string' ? el.className.trim() : ''
  if (classAttr) {
    const classes = classAttr.split(/\s+/).filter(Boolean).slice(0, 2)
    if (classes.length > 0) return `${tag}.${classes.join('.')}`
  }
  return tag
}

function isElementHidden(el: Element, style: CSSStyleDeclaration): boolean {
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.visibility === 'collapse'
  ) {
    return true
  }
  const opacity = Number.parseFloat(style.opacity || '1')
  if (!Number.isNaN(opacity) && opacity <= 0) return true
  if (el.hasAttribute('hidden')) return true
  return false
}

function isVisuallyHiddenSrOnly(style: CSSStyleDeclaration): boolean {
  if (style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clip === 'rect(0, 0, 0, 0)') {
    return true
  }
  if (
    style.position === 'absolute' &&
    style.width === '1px' &&
    style.height === '1px' &&
    style.overflow === 'hidden'
  ) {
    return true
  }
  return false
}

function hasDirectNonWhitespaceText(el: Element): boolean {
  for (let child = el.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3 && (child.nodeValue ?? '').trim().length > 0) {
      return true
    }
  }
  return false
}

function parseFontWeight(raw: string): number {
  const lower = raw.trim().toLowerCase()
  if (lower === 'bold' || lower === 'bolder') return 700
  if (lower === 'normal' || lower === 'lighter' || !lower) return 400
  const parsed = Number.parseFloat(lower)
  return Number.isNaN(parsed) ? 400 : parsed
}

function parsePx(raw: string | undefined | null): number {
  if (!raw) return 0
  const parsed = Number.parseFloat(raw)
  return Number.isNaN(parsed) ? 0 : parsed
}

function hasGradientTextClip(el: Element, style: CSSStyleDeclaration): boolean {
  const clip = (style.backgroundClip || '').toLowerCase()
  const webkitClip = (
    style.getPropertyValue('-webkit-background-clip') ||
    (style as unknown as Record<string, string>).webkitBackgroundClip ||
    ''
  ).toLowerCase()
  if (clip === 'text' || webkitClip === 'text') return true
  const inlineStyle = (el.getAttribute('style') || '').toLowerCase()
  return /(?:^|[;\s])(?:-webkit-)?background-clip\s*:\s*text\b/.test(inlineStyle)
}

function countWrappedLines(el: Element, style: CSSStyleDeclaration, doc: Document | null): number {
  // Method A: Range.getClientRects() when real layout rects exist
  if (doc && typeof doc.createRange === 'function') {
    const tops: number[] = []
    for (let node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType !== 3 || !(node.nodeValue ?? '').trim()) continue
      try {
        const range = doc.createRange()
        range.selectNodeContents(node)
        const rects = range.getClientRects?.()
        if (!rects) continue
        for (let i = 0; i < rects.length; i += 1) {
          const r = rects[i]!
          if (r.width <= 0 || r.height <= 0) continue
          if (!tops.some((t) => Math.abs(t - r.top) <= 2)) {
            tops.push(r.top)
          }
        }
      } catch {
        // jsdom Range.getClientRects may be unavailable
      }
    }
    if (tops.length >= 2) return tops.length
  }

  // Method B: Content box height vs computed line-height
  const rect = el.getBoundingClientRect()
  if (rect.height <= 0) return 1
  const fontSize = parsePx(style.fontSize) || 14
  const rawLineHeight = style.lineHeight
  const lineHeight =
    !rawLineHeight || rawLineHeight === 'normal'
      ? fontSize * 1.25
      : rawLineHeight.endsWith('px')
        ? parsePx(rawLineHeight)
        : Number.parseFloat(rawLineHeight) * fontSize
  if (!lineHeight || Number.isNaN(lineHeight)) return 1

  const verticalChrome =
    parsePx(style.paddingTop) +
    parsePx(style.paddingBottom) +
    parsePx(style.borderTopWidth) +
    parsePx(style.borderBottomWidth)
  const contentHeight = Math.max(0, rect.height - verticalChrome)
  return contentHeight > lineHeight * 1.65 ? Math.round(contentHeight / lineHeight) : 1
}

function extractShadowLengthsPx(layer: string): number[] {
  const withoutParens = layer
    .replace(/(?:rgba?|hsla?|color-mix|var)\([^)]*\)/gi, ' ')
    .replace(/#[0-9a-f]{3,8}\b/gi, ' ')
    .replace(/\b(?:inset|none)\b/gi, ' ')
  const tokens = withoutParens.trim().split(/\s+/)
  const lengths: number[] = []
  for (const token of tokens) {
    const match = /^(-?\d+(?:\.\d+)?)(px)?$/i.exec(token)
    if (match) {
      lengths.push(Number(match[1]))
    }
  }
  return lengths
}

function hasHeavyDropShadow(boxShadow: string): boolean {
  if (!boxShadow || boxShadow === 'none') return false
  const layers = boxShadow.split(/,(?![^(]*\))/)
  for (const rawLayer of layers) {
    const layer = rawLayer.trim()
    if (!layer || /\binset\b/i.test(layer)) continue
    const pxValues = extractShadowLengthsPx(layer)
    const offsetY = pxValues.length >= 2 ? Math.abs(pxValues[1]!) : 0
    const blur = pxValues.length >= 3 ? pxValues[2]! : 0
    const spread = pxValues.length >= 4 ? pxValues[3]! : 0
    if (blur >= 18 || offsetY >= 10 || (blur >= 12 && spread >= 2)) {
      return true
    }
  }
  return false
}

/**
 * Phase 2 (Render/DOM) TDS probe inspecting live computed styles, layout geometry, icons,
 * flex alignment, WCAG 2.1 contrast, and anti-AI-slop visual tells.
 * Works identically in Chromium and jsdom/happy-dom unit tests.
 */
export function runDomTdsProbe(root: ParentNode, options: TdsDomProbeOptions = {}): TdsLintIssue[] {
  const win = getOwnerWindow(root)
  if (!win) return []

  const doc =
    'ownerDocument' in root && root.ownerDocument ? root.ownerDocument : (root as Document)
  const antiSlop = options.antiSlop !== false
  const normalContrastMin = options.normalContrastMin ?? 4.5
  const largeContrastMin = options.largeContrastMin ?? 3.0
  const misalignMinPx = options.misalignMinPx ?? 0.5
  const misalignMaxPx = options.misalignMaxPx ?? 4
  const minFontSizePx = options.minFontSizePx ?? 11
  const defaultBackdrop: RgbTuple = options.defaultBackdropRgb
    ? [options.defaultBackdropRgb[0], options.defaultBackdropRgb[1], options.defaultBackdropRgb[2]]
    : [255, 255, 255]

  const elements: Element[] = []
  if ('nodeType' in root && (root as Node).nodeType === 1) {
    elements.push(root as Element)
  }
  elements.push(...Array.from(root.querySelectorAll('*')))

  const hasLayoutMetrics = elements.some((node) => {
    const r = node.getBoundingClientRect()
    return r.width > 0 || r.height > 0
  })

  const issues: TdsLintIssue[] = []

  for (const el of elements) {
    const tag = el.tagName.toUpperCase()
    if (SKIP_TEXT_TAGS.has(tag)) continue

    const style = win.getComputedStyle(el)
    if (isElementHidden(el, style)) continue

    const selector = buildCompactSelector(el)
    const className = typeof el.className === 'string' ? el.className : ''
    const text = (el.textContent ?? '').trim()

    // 1. `icon-missing`
    if ((tag === 'I' || tag === 'SPAN') && ICON_CLASS_PATTERN.test(className)) {
      const hasGraphicChild = el.querySelector('svg, img, canvas') !== null
      const hasGlyphText = text.length > 0
      const maskImg = (
        style.maskImage ||
        style.getPropertyValue('-webkit-mask-image') ||
        (style as unknown as Record<string, string>).webkitMaskImage ||
        ''
      ).trim()
      const bgImg = (style.backgroundImage || '').trim()
      let pseudoHasGraphic = false
      const isJsdom = /jsdom/i.test(win.navigator?.userAgent || '')
      if (!isJsdom) {
        try {
          const before = win.getComputedStyle(el, '::before')
          const bMask = (
            before.maskImage ||
            before.getPropertyValue('-webkit-mask-image') ||
            ''
          ).trim()
          const bBg = (before.backgroundImage || '').trim()
          const bContent = (before.content || '').trim()
          if (
            (bMask && bMask !== 'none') ||
            (bBg && bBg !== 'none') ||
            (bContent &&
              bContent !== 'none' &&
              bContent !== 'normal' &&
              bContent !== '""' &&
              bContent !== "''")
          ) {
            pseudoHasGraphic = true
          }
        } catch {
          // ignore pseudo-element lookup errors in limited DOM environments
        }
      }

      const hasPaintedImage =
        (maskImg !== '' && maskImg !== 'none') ||
        (bgImg !== '' && bgImg !== 'none') ||
        pseudoHasGraphic

      const rect = el.getBoundingClientRect()
      const explicitlyZeroBox = style.width === '0px' || style.height === '0px'
      const collapsedLiveBox = hasLayoutMetrics && (rect.width <= 0 || rect.height <= 0)

      if (
        !hasGraphicChild &&
        !hasGlyphText &&
        (!hasPaintedImage || explicitlyZeroBox || collapsedLiveBox)
      ) {
        issues.push({
          ruleId: 'icon-missing',
          phase: 'dom',
          severity: 'error',
          category: 'icons',
          message: `Icon element \`${selector}\` has no painted graphic or collapsed box.`,
          fixHint:
            'Use an inline `<svg>` or a bundled RemixIcon (`i-ri-*`) / Lucide icon that resolves offline.',
          selector,
          snippet: className.trim().slice(0, 80)
        })
      }
    }

    // 2. `text-clipped`
    const overflowX = style.overflowX || style.overflow
    const overflowY = style.overflowY || style.overflow
    const clipX =
      (overflowX === 'hidden' || overflowX === 'clip') &&
      el.clientWidth > 0 &&
      el.scrollWidth > el.clientWidth + 1
    const clipY =
      (overflowY === 'hidden' || overflowY === 'clip') &&
      el.clientHeight > 0 &&
      el.scrollHeight > el.clientHeight + 1
    if (text.length > 0 && (clipX || clipY)) {
      const axis = clipX && clipY ? 'width & height' : clipX ? 'width' : 'height'
      issues.push({
        ruleId: 'text-clipped',
        phase: 'dom',
        severity: 'warning',
        category: 'layout',
        message: `Element \`${selector}\` clips text (${axis}: scroll ${el.scrollWidth}×${el.scrollHeight} > client ${el.clientWidth}×${el.clientHeight}).`,
        fixHint:
          'Allow the container to grow, shorten the label, or provide explicit truncation with tooltip/title.',
        selector,
        snippet: text.slice(0, 60)
      })
    }

    // 3. `unintended-wrap`
    const role = (el.getAttribute('role') || '').toLowerCase()
    const isCompactControl =
      tag === 'BUTTON' ||
      role === 'button' ||
      role === 'tab' ||
      COMPACT_CONTROL_CLASS_PATTERN.test(className)
    if (
      isCompactControl &&
      text.length > 0 &&
      text.length <= 32 &&
      el.querySelector('br, p, div, ul, ol') === null
    ) {
      const lineCount = countWrappedLines(el, style, doc)
      if (lineCount >= 2) {
        issues.push({
          ruleId: 'unintended-wrap',
          phase: 'dom',
          severity: 'warning',
          category: 'layout',
          message: `Short control \`${selector}\` ("${text}") wraps onto ${lineCount} lines.`,
          fixHint:
            'Add `white-space: nowrap` (or widen the control / tighten adjacent spacing) so button, badge, and tab labels stay single-line.',
          selector,
          snippet: text
        })
      }
    }

    // 4. `edge-misaligned`
    const isHorizontalFlex =
      (style.display === 'flex' || style.display === 'inline-flex') &&
      (style.flexDirection === '' ||
        style.flexDirection === 'row' ||
        style.flexDirection === 'row-reverse')
    const isTopAligned =
      !style.alignItems ||
      style.alignItems === 'flex-start' ||
      style.alignItems === 'start' ||
      style.alignItems === 'stretch' ||
      style.alignItems === 'normal'
    if (isHorizontalFlex && isTopAligned && el.children.length >= 2) {
      const visibleChildren: Array<{ child: Element; rect: DOMRect }> = []
      for (let i = 0; i < el.children.length; i += 1) {
        const child = el.children[i]!
        const cStyle = win.getComputedStyle(child)
        if (isElementHidden(child, cStyle)) continue
        const rect = child.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          visibleChildren.push({ child, rect })
        }
      }
      let reportedForContainer = false
      for (let i = 0; i < visibleChildren.length && !reportedForContainer; i += 1) {
        for (let j = i + 1; j < visibleChildren.length; j += 1) {
          const a = visibleChildren[i]!
          const b = visibleChildren[j]!
          // Ensure siblings actually occupy the same horizontal band.
          if (a.rect.bottom <= b.rect.top || b.rect.bottom <= a.rect.top) continue
          const diff = Math.abs(a.rect.top - b.rect.top)
          if (diff >= misalignMinPx && diff <= misalignMaxPx) {
            issues.push({
              ruleId: 'edge-misaligned',
              phase: 'dom',
              severity: 'warning',
              category: 'layout',
              message: `Flex siblings in \`${selector}\` are top-edge misaligned by ${diff.toFixed(1)}px.`,
              fixHint:
                'Remove uneven top margins/borders on siblings or use explicit `align-items: center` / uniform padding.',
              selector,
              snippet: `${buildCompactSelector(a.child)} vs ${buildCompactSelector(b.child)} (Δ${diff.toFixed(1)}px)`
            })
            reportedForContainer = true
            break
          }
        }
      }
    }

    // 5. Leaf text checks: `contrast-fail`, `tell-gradient-text`, `tell-small-text`
    const isLeafText = hasDirectNonWhitespaceText(el) && !isVisuallyHiddenSrOnly(style)
    const gradientClip = text.length > 0 && hasGradientTextClip(el, style)

    if (antiSlop && gradientClip) {
      issues.push({
        ruleId: 'tell-gradient-text',
        phase: 'dom',
        severity: 'warning',
        category: 'anti-slop',
        message: `Element \`${selector}\` uses gradient-clipped text (\`background-clip: text\`).`,
        fixHint:
          'Use solid TDS ink (`var(--shell-text-primary)` or `var(--shell-primary)`) for readable, restrained hierarchy.',
        selector,
        snippet: text.slice(0, 60)
      })
    }

    if (isLeafText && !gradientClip) {
      const fontSize = parsePx(style.fontSize)
      const fontWeight = parseFontWeight(style.fontWeight || '400')

      // 5a. WCAG 2.1 `contrast-fail`
      const fgParsed = parseCssColor(style.color)
      if (fgParsed) {
        const effBg = resolveEffectiveBackground(el, win, defaultBackdrop)
        const elOpacity = Number.parseFloat(style.opacity || '1')
        const fgAlpha = clampAlpha(fgParsed[3] * (Number.isNaN(elOpacity) ? 1 : elOpacity))
        const effFg: RgbTuple =
          fgAlpha < 1
            ? compositeRgbaOverRgb([fgParsed[0], fgParsed[1], fgParsed[2], fgAlpha], effBg)
            : [fgParsed[0], fgParsed[1], fgParsed[2]]
        const ratio = contrastRatioRgb(effFg, effBg)
        const effectiveFontSize = fontSize > 0 ? fontSize : 14
        const isLargeText =
          effectiveFontSize >= 18 || (effectiveFontSize >= 14 && fontWeight >= 700)
        const minRatio = isLargeText ? largeContrastMin : normalContrastMin
        if (ratio < minRatio) {
          issues.push({
            ruleId: 'contrast-fail',
            phase: 'dom',
            severity: 'error',
            category: 'contrast',
            message: `Text in \`${selector}\` has WCAG 2.1 contrast ${ratio.toFixed(2)}:1 (requires >= ${minRatio.toFixed(1)}:1).`,
            fixHint:
              'Use TDS verified ink/surface pairs (`--shell-text-primary` / `--shell-text-regular` on `--shell-bg` / `--shell-surface`).',
            selector,
            snippet: `${ratio.toFixed(2)}:1 < ${minRatio.toFixed(1)}:1 ("${text.slice(0, 36)}")`
          })
        }
      }

      // 5b. `tell-small-text` (< 11px)
      if (
        antiSlop &&
        el.getAttribute('aria-hidden') !== 'true' &&
        fontSize > 0 &&
        fontSize < minFontSizePx
      ) {
        issues.push({
          ruleId: 'tell-small-text',
          phase: 'dom',
          severity: 'warning',
          category: 'anti-slop',
          message: `Text in \`${selector}\` renders at ${fontSize}px (below ${minFontSizePx}px legibility floor).`,
          fixHint:
            'Use TDS typography scale: 13–14px for body/controls, 12px for helper copy, and 11px minimum for captions.',
          selector,
          snippet: `${fontSize}px ("${text.slice(0, 36)}")`
        })
      }
    }

    // 6. Anti-slop `tell-emoji-icon`
    if (antiSlop && el.children.length === 0 && EMOJI_ONLY_PATTERN.test(text)) {
      const rect = el.getBoundingClientRect()
      const hasSmallRect =
        rect.width > 0 && rect.height > 0 && rect.width <= 64 && rect.height <= 64
      const cssW = parsePx(style.width)
      const cssH = parsePx(style.height)
      const hasSmallCssBox = cssW > 0 && cssH > 0 && cssW <= 64 && cssH <= 64
      const bgParsed = parseCssColor(style.backgroundColor)
      const hasTileSurface = Boolean(bgParsed && bgParsed[3] > 0) || parsePx(style.borderRadius) > 0
      const isIconTile =
        hasSmallRect ||
        hasSmallCssBox ||
        ICON_TILE_CLASS_PATTERN.test(className) ||
        (hasTileSurface &&
          (style.display === 'flex' ||
            style.display === 'inline-flex' ||
            style.display === 'grid' ||
            style.display === 'inline-grid'))
      if (isIconTile) {
        issues.push({
          ruleId: 'tell-emoji-icon',
          phase: 'dom',
          severity: 'warning',
          category: 'anti-slop',
          message: `Icon tile \`${selector}\` uses emoji "${text}" as a UI icon.`,
          fixHint:
            'Replace decorative emoji icons with clean vector SVGs or RemixIcon/Lucide monochrome glyphs (`TxIcon`).',
          selector,
          snippet: text
        })
      }
    }

    // 7. Anti-slop `tell-resting-card-shadow`
    if (antiSlop) {
      const isCardLike =
        tag === 'ARTICLE' ||
        tag === 'SECTION' ||
        CARD_CLASS_PATTERN.test(className) ||
        el.hasAttribute('data-card')
      const isFloating =
        style.position === 'fixed' ||
        style.position === 'absolute' ||
        style.position === 'sticky' ||
        FLOATING_ROLES.has(role)
      if (isCardLike && !isFloating && hasHeavyDropShadow(style.boxShadow || '')) {
        issues.push({
          ruleId: 'tell-resting-card-shadow',
          phase: 'dom',
          severity: 'warning',
          category: 'anti-slop',
          message: `Resting card \`${selector}\` uses a heavy drop shadow (\`${style.boxShadow.slice(0, 48)}\`).`,
          fixHint:
            'Reserve deep elevation for floating overlays; separate resting cards with 1px `--shell-border` or subtle `--tx-elevation-1`.',
          selector,
          snippet: style.boxShadow.slice(0, 80)
        })
      }
    }
  }

  return issues
}

/**
 * Builds a self-contained IIFE script string safe to execute inside any isolated preview
 * document to run Phase 2 DOM checks with the supplied options.
 */
export function buildTdsDomProbeScript(options: TdsDomProbeOptions = {}): string {
  const serializedOptions = JSON.stringify({
    antiSlop: options.antiSlop !== false,
    normalContrastMin: options.normalContrastMin ?? 4.5,
    largeContrastMin: options.largeContrastMin ?? 3.0,
    misalignMinPx: options.misalignMinPx ?? 0.5,
    misalignMaxPx: options.misalignMaxPx ?? 4,
    minFontSizePx: options.minFontSizePx ?? 11,
    defaultBackdropRgb: options.defaultBackdropRgb ?? [255, 255, 255]
  })

  return `(function(root, opts){
  var win = (root && root.defaultView) || (root && root.ownerDocument && root.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null);
  if (!win || !root) return [];
  var doc = (root.ownerDocument) || root;
  var NAMED = {transparent:[0,0,0,0],black:[0,0,0,1],white:[255,255,255,1],red:[255,0,0,1],green:[0,128,0,1],blue:[0,0,255,1],yellow:[255,255,0,1],cyan:[0,255,255,1],magenta:[255,0,255,1],gray:[128,128,128,1],grey:[128,128,128,1],silver:[192,192,192,1],orange:[255,165,0,1],purple:[128,0,128,1],navy:[0,0,128,1],teal:[0,128,128,1]};
  var SKIP = {SCRIPT:1,STYLE:1,NOSCRIPT:1,TEMPLATE:1,TITLE:1,META:1,LINK:1};
  var FLOATING = {dialog:1,alertdialog:1,menu:1,listbox:1,tooltip:1,popover:1};
  var ICON_RE = /(?:^|\\s)(?:i-[a-z0-9][a-z0-9-]*|icon-\\[[^\\]]+\\])(?=\\s|$)/i;
  var CONTROL_RE = /\\b(?:badge|pill|chip|tag|tab|status-badge)\\b/i;
  var CARD_RE = /\\bcard\\b/i;
  var TILE_RE = /\\b(?:icon|tile|avatar|badge|chip|emoji|feature-icon|stat-icon)\\b/i;
  var EMOJI_RE = /^(?:\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic})*){1,2}$/u;
  function clampC(v){return Math.max(0,Math.min(255,v));}
  function clampA(v){return Math.max(0,Math.min(1,v));}
  function parseColor(raw){
    if(!raw) return null;
    var s = String(raw).trim().toLowerCase();
    if(!s||s==='none'||s==='inherit'||s==='initial') return null;
    if(NAMED[s]) return NAMED[s].slice();
    var hm = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
    if(hm){
      var d = hm[1];
      if(d.length===3||d.length===4){
        return [parseInt(d[0]+d[0],16),parseInt(d[1]+d[1],16),parseInt(d[2]+d[2],16),d.length===4?parseInt(d[3]+d[3],16)/255:1];
      }
      return [parseInt(d.slice(0,2),16),parseInt(d.slice(2,4),16),parseInt(d.slice(4,6),16),d.length===8?parseInt(d.slice(6,8),16)/255:1];
    }
    var rm = /^rgba?\\(\\s*([^)]+?)\\s*\\)$/.exec(s);
    if(rm){
      var body = rm[1], ch, ap;
      if(body.indexOf(',')>=0){var parts=body.split(',').map(function(p){return p.trim();});ch=parts.slice(0,3);ap=parts[3];}
      else{var sp=body.split('/');ch=sp[0].trim().split(/\\s+/).filter(Boolean);ap=sp[1]&&sp[1].trim();}
      if(ch.length<3) return null;
      var pc=function(t){return t.endsWith('%')?clampC(parseFloat(t)/100*255):clampC(parseFloat(t));};
      var r=pc(ch[0]),g=pc(ch[1]),b=pc(ch[2]);
      if(isNaN(r)||isNaN(g)||isNaN(b)) return null;
      var a=1;
      if(ap!==undefined&&ap!==''){a=ap.endsWith('%')?clampA(parseFloat(ap)/100):clampA(parseFloat(ap));if(isNaN(a))a=1;}
      return [r,g,b,a];
    }
    return null;
  }
  function over(fg,bg){var a=fg[3];return [fg[0]*a+bg[0]*(1-a),fg[1]*a+bg[1]*(1-a),fg[2]*a+bg[2]*(1-a)];}
  function lum(rgb){
    function lin(c){var s=clampC(c)/255;return s<=0.04045?s/12.92:Math.pow((s+0.055)/1.055,2.4);}
    return 0.2126*lin(rgb[0])+0.7152*lin(rgb[1])+0.0722*lin(rgb[2]);
  }
  function contrast(a,b){var la=lum(a),lb=lum(b);return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05);}
  function effBg(el){
    var chain=[], cur=el;
    while(cur){chain.push(cur);cur=cur.parentElement;}
    var bg=[opts.defaultBackdropRgb[0],opts.defaultBackdropRgb[1],opts.defaultBackdropRgb[2]];
    for(var i=chain.length-1;i>=0;i--){
      var st=win.getComputedStyle(chain[i]);
      var p=parseColor(st.backgroundColor);
      if(!p||p[3]<=0) continue;
      var op=parseFloat(st.opacity||'1');
      bg=over([p[0],p[1],p[2],clampA(p[3]*(isNaN(op)?1:op))],bg);
    }
    return bg;
  }
  function sel(el){
    var t=el.tagName.toLowerCase();
    var id=el.getAttribute('id');
    if(id) return t+'#'+id;
    var cn=typeof el.className==='string'?el.className.trim():'';
    if(cn){var cs=cn.split(/\\s+/).filter(Boolean).slice(0,2);if(cs.length)return t+'.'+cs.join('.');}
    return t;
  }
  function hidden(el,st){
    if(st.display==='none'||st.visibility==='hidden'||st.visibility==='collapse') return true;
    var op=parseFloat(st.opacity||'1');
    return (!isNaN(op)&&op<=0)||el.hasAttribute('hidden');
  }
  function px(v){var n=parseFloat(v||'0');return isNaN(n)?0:n;}
  function hasDirectText(el){for(var c=el.firstChild;c;c=c.nextSibling){if(c.nodeType===3&&(c.nodeValue||'').trim())return true;}return false;}
  function hasGradClip(el,st){
    var c=(st.backgroundClip||'').toLowerCase();
    var wc=(st.getPropertyValue('-webkit-background-clip')||'').toLowerCase();
    if(c==='text'||wc==='text') return true;
    return /(?:^|[;\\s])(?:-webkit-)?background-clip\\s*:\\s*text\\b/.test((el.getAttribute('style')||'').toLowerCase());
  }
  function heavyShadow(bs){
    if(!bs||bs==='none') return false;
    var layers=bs.split(/,(?![^(]*\\))/);
    for(var i=0;i<layers.length;i++){
      var l=layers[i].trim();
      if(!l||/\\binset\\b/i.test(l)) continue;
      var cleaned=l.replace(/(?:rgba?|hsla?|color-mix|var)\\([^)]*\\)/gi,' ').replace(/#[0-9a-f]{3,8}\\b/gi,' ').replace(/\\b(?:inset|none)\\b/gi,' ');
      var toks=cleaned.trim().split(/\\s+/), nums=[];
      for(var ti=0;ti<toks.length;ti++){var lm=/^(-?\\d+(?:\\.\\d+)?)(px)?$/i.exec(toks[ti]);if(lm)nums.push(parseFloat(lm[1]));}
      var oy=nums.length>=2?Math.abs(nums[1]):0;
      var bl=nums.length>=3?nums[2]:0;
      var sp=nums.length>=4?nums[3]:0;
      if(bl>=18||oy>=10||(bl>=12&&sp>=2)) return true;
    }
    return false;
  }
  var all=[];
  if(win.Element && root instanceof win.Element) all.push(root);
  var q=root.querySelectorAll('*');
  for(var qi=0;qi<q.length;qi++) all.push(q[qi]);
  var hasLayout=all.some(function(n){var r=n.getBoundingClientRect();return r.width>0||r.height>0;});
  var issues=[];
  for(var i=0;i<all.length;i++){
    var el=all[i], tag=el.tagName.toUpperCase();
    if(SKIP[tag]) continue;
    var st=win.getComputedStyle(el);
    if(hidden(el,st)) continue;
    var s=sel(el), cn=typeof el.className==='string'?el.className:'', txt=(el.textContent||'').trim();
    if((tag==='I'||tag==='SPAN')&&ICON_RE.test(cn)){
      var hasG=el.querySelector('svg,img,canvas')!==null||txt.length>0;
      var mi=(st.maskImage||st.getPropertyValue('-webkit-mask-image')||'').trim();
      var bi=(st.backgroundImage||'').trim();
      var painted=(mi&&mi!=='none')||(bi&&bi!=='none');
      var rc=el.getBoundingClientRect();
      var zeroBox=st.width==='0px'||st.height==='0px'||(hasLayout&&(rc.width<=0||rc.height<=0));
      if(!hasG&&(!painted||zeroBox)){
        issues.push({ruleId:'icon-missing',phase:'dom',severity:'error',category:'icons',message:'Icon element \`'+s+'\` has no painted graphic or collapsed box.',fixHint:'Use an inline <svg> or a bundled RemixIcon (i-ri-*) / Lucide icon that resolves offline.',selector:s,snippet:cn.trim().slice(0,80)});
      }
    }
    var ox=st.overflowX||st.overflow, oy=st.overflowY||st.overflow;
    var cx=(ox==='hidden'||ox==='clip')&&el.clientWidth>0&&el.scrollWidth>el.clientWidth+1;
    var cy=(oy==='hidden'||oy==='clip')&&el.clientHeight>0&&el.scrollHeight>el.clientHeight+1;
    if(txt.length>0&&(cx||cy)){
      issues.push({ruleId:'text-clipped',phase:'dom',severity:'warning',category:'layout',message:'Element \`'+s+'\` clips text.',fixHint:'Allow the container to grow, shorten the label, or provide explicit truncation with tooltip/title.',selector:s,snippet:txt.slice(0,60)});
    }
    var role=(el.getAttribute('role')||'').toLowerCase();
    if((tag==='BUTTON'||role==='button'||role==='tab'||CONTROL_RE.test(cn))&&txt.length>0&&txt.length<=32&&!el.querySelector('br,p,div,ul,ol')){
      var r=el.getBoundingClientRect(), fs=px(st.fontSize)||14;
      var lh=!st.lineHeight||st.lineHeight==='normal'?fs*1.25:(st.lineHeight.endsWith('px')?px(st.lineHeight):parseFloat(st.lineHeight)*fs);
      var ch=Math.max(0,r.height-px(st.paddingTop)-px(st.paddingBottom)-px(st.borderTopWidth)-px(st.borderBottomWidth));
      if(r.height>0&&lh>0&&ch>lh*1.65){
        issues.push({ruleId:'unintended-wrap',phase:'dom',severity:'warning',category:'layout',message:'Short control \`'+s+'\` wraps onto multiple lines.',fixHint:'Add white-space: nowrap or widen the control so labels stay single-line.',selector:s,snippet:txt});
      }
    }
    if((st.display==='flex'||st.display==='inline-flex')&&(!st.flexDirection||st.flexDirection==='row'||st.flexDirection==='row-reverse')&&(!st.alignItems||st.alignItems==='flex-start'||st.alignItems==='start'||st.alignItems==='stretch'||st.alignItems==='normal')&&el.children.length>=2){
      var vis=[];
      for(var ci=0;ci<el.children.length;ci++){var c=el.children[ci],cst=win.getComputedStyle(c);if(hidden(c,cst))continue;var cr=c.getBoundingClientRect();if(cr.width>0&&cr.height>0)vis.push({el:c,r:cr});}
      var found=false;
      for(var a=0;a<vis.length&&!found;a++){
        for(var b=a+1;b<vis.length;b++){
          if(vis[a].r.bottom<=vis[b].r.top||vis[b].r.bottom<=vis[a].r.top) continue;
          var diff=Math.abs(vis[a].r.top-vis[b].r.top);
          if(diff>=opts.misalignMinPx&&diff<=opts.misalignMaxPx){
            issues.push({ruleId:'edge-misaligned',phase:'dom',severity:'warning',category:'layout',message:'Flex siblings in \`'+s+'\` are top-edge misaligned by '+diff.toFixed(1)+'px.',fixHint:'Remove uneven top margins/borders on siblings or use explicit align-items: center.',selector:s,snippet:sel(vis[a].el)+' vs '+sel(vis[b].el)});
            found=true;break;
          }
        }
      }
    }
    var gClip=txt.length>0&&hasGradClip(el,st);
    if(opts.antiSlop&&gClip){
      issues.push({ruleId:'tell-gradient-text',phase:'dom',severity:'warning',category:'anti-slop',message:'Element \`'+s+'\` uses gradient-clipped text.',fixHint:'Use solid TDS ink (--shell-text-primary or --shell-primary).',selector:s,snippet:txt.slice(0,60)});
    }
    var srOnly=(st.clip==='rect(0px, 0px, 0px, 0px)'||st.clip==='rect(0, 0, 0, 0)')||(st.position==='absolute'&&st.width==='1px'&&st.height==='1px'&&st.overflow==='hidden');
    if(hasDirectText(el)&&!srOnly&&!gClip){
      var fsz=px(st.fontSize), fw=(st.fontWeight==='bold'||st.fontWeight==='bolder')?700:(parseFloat(st.fontWeight)||400);
      var fgp=parseColor(st.color);
      if(fgp){
        var bg=effBg(el), op=parseFloat(st.opacity||'1'), fa=clampA(fgp[3]*(isNaN(op)?1:op));
        var fg=fa<1?over([fgp[0],fgp[1],fgp[2],fa],bg):[fgp[0],fgp[1],fgp[2]];
        var ratio=contrast(fg,bg), efs=fsz>0?fsz:14;
        var minR=(efs>=18||(efs>=14&&fw>=700))?opts.largeContrastMin:opts.normalContrastMin;
        if(ratio<minR){
          issues.push({ruleId:'contrast-fail',phase:'dom',severity:'error',category:'contrast',message:'Text in \`'+s+'\` has WCAG 2.1 contrast '+ratio.toFixed(2)+':1 (requires >= '+minR.toFixed(1)+':1).',fixHint:'Use TDS verified ink/surface pairs.',selector:s,snippet:ratio.toFixed(2)+':1 < '+minR.toFixed(1)+':1'});
        }
      }
      if(opts.antiSlop&&el.getAttribute('aria-hidden')!=='true'&&fsz>0&&fsz<opts.minFontSizePx){
        issues.push({ruleId:'tell-small-text',phase:'dom',severity:'warning',category:'anti-slop',message:'Text in \`'+s+'\` renders at '+fsz+'px (below '+opts.minFontSizePx+'px floor).',fixHint:'Use TDS 11px-14px typography scale.',selector:s,snippet:fsz+'px'});
      }
    }
    if(opts.antiSlop&&el.children.length===0&&EMOJI_RE.test(txt)){
      var er=el.getBoundingClientRect(), cw=px(st.width), ch2=px(st.height), bp=parseColor(st.backgroundColor);
      var tile=(er.width>0&&er.height>0&&er.width<=64&&er.height<=64)||(cw>0&&ch2>0&&cw<=64&&ch2<=64)||TILE_RE.test(cn)||(((bp&&bp[3]>0)||px(st.borderRadius)>0)&&(st.display==='flex'||st.display==='inline-flex'||st.display==='grid'||st.display==='inline-grid'));
      if(tile){
        issues.push({ruleId:'tell-emoji-icon',phase:'dom',severity:'warning',category:'anti-slop',message:'Icon tile \`'+s+'\` uses emoji as a UI icon.',fixHint:'Replace decorative emoji icons with clean SVG or RemixIcon/Lucide icons.',selector:s,snippet:txt});
      }
    }
    if(opts.antiSlop&&(tag==='ARTICLE'||tag==='SECTION'||CARD_RE.test(cn)||el.hasAttribute('data-card'))&&st.position!=='fixed'&&st.position!=='absolute'&&st.position!=='sticky'&&!FLOATING[role]&&heavyShadow(st.boxShadow||'')){
      issues.push({ruleId:'tell-resting-card-shadow',phase:'dom',severity:'warning',category:'anti-slop',message:'Resting card \`'+s+'\` uses a heavy drop shadow.',fixHint:'Separate resting cards with 1px --shell-border or subtle --tx-elevation-1.',selector:s,snippet:st.boxShadow.slice(0,80)});
    }
  }
  return issues;
})(document, ${serializedOptions})`
}

/**
 * Default self-contained IIFE script string safe to execute in any isolated preview document.
 */
export const TDS_DOM_PROBE_SCRIPT: string = buildTdsDomProbeScript({ antiSlop: true })
