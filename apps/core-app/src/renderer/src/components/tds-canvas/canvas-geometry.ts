import { stepSpring } from '@talex-touch/tuffex/utils'
import {
  getDevicePresetById,
  isResponsivePreset,
  resolveDeviceDimensions
} from '../preview/tds-devices'
import type {
  ArrangeFramesOptions,
  FrameSnapResult,
  SnapAnchorKind,
  SnapGuide,
  TdsCanvasFrame,
  TdsCanvasFrameKind,
  TdsCanvasNote,
  TdsCanvasPoint,
  TdsCanvasRect,
  TdsCanvasSendNotesPayload,
  TdsCanvasSize,
  TdsCanvasViewport
} from './types'

export const CANVAS_MIN_ZOOM = 0.05
export const CANVAS_MAX_ZOOM = 4.0
export const CANVAS_MAX_LABEL_SCALE = 8
export const DEFAULT_SNAP_THRESHOLD_PX = 8
export const DEFAULT_GRID_GAP_X = 64
export const DEFAULT_GRID_GAP_Y = 88
export const FRAME_HEADER_ALLOWANCE_PX = 36

export const DEFAULT_RESPONSIVE_FRAME_SIZE: Readonly<TdsCanvasSize> = {
  width: 1024,
  height: 720
}

/**
 * Strict zero-network Content-Security-Policy mirroring `WorkspaceFileViewer`:
 * opaque origin (no `allow-same-origin`) and `default-src 'none'` prevent all
 * external fetches, remote fonts, or data exfiltration from rendered frames.
 */
export const TDS_CANVAS_FRAME_CSP =
  "default-src 'none'; form-action 'none'; frame-src about:; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"

/**
 * Critically-damped viewport spring (`response = 0.28s`, `dampingRatio = 1`)
 * stepped via TuffEx's `@talex-touch/tuffex/utils` `stepSpring` integrator.
 */
const VIEWPORT_SPRING_OMEGA = (2 * Math.PI) / 0.28
export const CANVAS_VIEWPORT_SPRING = {
  stiffness: VIEWPORT_SPRING_OMEGA * VIEWPORT_SPRING_OMEGA,
  damping: 2 * VIEWPORT_SPRING_OMEGA
} as const

export function clampCanvasZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  return Math.max(CANVAS_MIN_ZOOM, Math.min(CANVAS_MAX_ZOOM, zoom))
}

/**
 * Cursor-anchored viewport rescale matching `packages/tuffex/packages/utils/pan-zoom.ts`
 * `PanZoomView` / `scaleAbout`, keeping the world point under `point` pinned in place.
 */
export function scaleAbout(
  view: TdsCanvasViewport,
  nextZoom: number,
  point: TdsCanvasPoint
): TdsCanvasViewport {
  const safeCurrentK = clampCanvasZoom(view.k)
  const k = clampCanvasZoom(nextZoom)
  const ratio = k / safeCurrentK
  return {
    k,
    tx: point.x - (point.x - view.tx) * ratio,
    ty: point.y - (point.y - view.ty) * ratio
  }
}

export function panViewportBy(view: TdsCanvasViewport, dx: number, dy: number): TdsCanvasViewport {
  return {
    k: view.k,
    tx: view.tx + dx,
    ty: view.ty + dy
  }
}

export function screenToWorld(point: TdsCanvasPoint, view: TdsCanvasViewport): TdsCanvasPoint {
  const k = clampCanvasZoom(view.k)
  return {
    x: (point.x - view.tx) / k,
    y: (point.y - view.ty) / k
  }
}

export function worldToScreen(point: TdsCanvasPoint, view: TdsCanvasViewport): TdsCanvasPoint {
  const k = clampCanvasZoom(view.k)
  return {
    x: point.x * k + view.tx,
    y: point.y * k + view.ty
  }
}

/**
 * Exponential wheel zoom factor matching `packages/tuffex/packages/utils/gesture.ts`:
 * a 100px mouse wheel notch scales by sqrt(2), and equal in/out deltas cancel cleanly.
 */
export function wheelDeltaToZoomFactor(deltaPixels: number): number {
  const clamped = Math.max(-100, Math.min(100, Number.isFinite(deltaPixels) ? deltaPixels : 0))
  return 2 ** (-clamped / 200)
}

/**
 * Steps a viewport transition toward `target` using TuffEx's `stepSpring`.
 */
export function stepViewportSpring(
  current: TdsCanvasViewport,
  velocity: TdsCanvasViewport,
  target: TdsCanvasViewport,
  dtSeconds: number
): { view: TdsCanvasViewport; velocity: TdsCanvasViewport; settled: boolean } {
  const [nextK, nextVk] = stepSpring(
    current.k,
    velocity.k,
    target.k,
    CANVAS_VIEWPORT_SPRING,
    dtSeconds
  )
  const [nextTx, nextVtx] = stepSpring(
    current.tx,
    velocity.tx,
    target.tx,
    CANVAS_VIEWPORT_SPRING,
    dtSeconds
  )
  const [nextTy, nextVty] = stepSpring(
    current.ty,
    velocity.ty,
    target.ty,
    CANVAS_VIEWPORT_SPRING,
    dtSeconds
  )

  const kSettled = Math.abs(target.k - nextK) < 1e-4 && Math.abs(nextVk) < 1e-3
  const txSettled = Math.abs(target.tx - nextTx) < 0.25 && Math.abs(nextVtx) < 4
  const tySettled = Math.abs(target.ty - nextTy) < 0.25 && Math.abs(nextVty) < 4
  const settled = kSettled && txSettled && tySettled

  if (settled) {
    return {
      view: { ...target },
      velocity: { k: 0, tx: 0, ty: 0 },
      settled: true
    }
  }

  return {
    view: { k: clampCanvasZoom(nextK), tx: nextTx, ty: nextTy },
    velocity: { k: nextVk, tx: nextVtx, ty: nextVty },
    settled: false
  }
}

/**
 * Constant-screen-size scale factor for frame titles, selection rings, and pin notes:
 * `Math.min(1 / Math.max(zoom, 0.05), 8)`.
 */
export function inverseLabelScale(zoom: number): number {
  const safeZoom = Number.isFinite(zoom) ? zoom : 1
  return Math.min(1 / Math.max(safeZoom, CANVAS_MIN_ZOOM), CANVAS_MAX_LABEL_SCALE)
}

export function resolveFrameLogicalSize(
  frame: Pick<TdsCanvasFrame, 'deviceId' | 'orientation' | 'width' | 'height'>
): TdsCanvasSize {
  const preset = getDevicePresetById(frame.deviceId)
  if (isResponsivePreset(preset)) {
    const width =
      frame.width && Number.isFinite(frame.width) && frame.width > 0
        ? frame.width
        : DEFAULT_RESPONSIVE_FRAME_SIZE.width
    const height =
      frame.height && Number.isFinite(frame.height) && frame.height > 0
        ? frame.height
        : DEFAULT_RESPONSIVE_FRAME_SIZE.height
    return { width, height }
  }
  const resolved = resolveDeviceDimensions(preset, frame.orientation ?? 'portrait')
  return { width: resolved.width, height: resolved.height }
}

/**
 * Computes the outer pixel footprint of a frame including `TdsDeviceFrame` hardware bezel.
 */
export function resolveFrameOuterSize(
  frame: Pick<TdsCanvasFrame, 'deviceId' | 'orientation' | 'showShell' | 'width' | 'height'>
): TdsCanvasSize {
  const preset = getDevicePresetById(frame.deviceId)
  const logical = resolveFrameLogicalSize(frame)
  const bezel = !isResponsivePreset(preset) && frame.showShell !== false ? preset.bezel : 0
  return {
    width: logical.width + bezel * 2,
    height: logical.height + bezel * 2
  }
}

export function getFrameWorldRect(frame: TdsCanvasFrame): TdsCanvasRect {
  const size = resolveFrameOuterSize(frame)
  return {
    x: frame.x,
    y: frame.y,
    width: size.width,
    height: size.height
  }
}

interface AxisAnchor {
  kind: SnapAnchorKind
  value: number
}

function getRectAxisAnchors(
  rect: TdsCanvasRect,
  axis: 'x' | 'y'
): [AxisAnchor, AxisAnchor, AxisAnchor] {
  if (axis === 'x') {
    return [
      { kind: 'start', value: rect.x },
      { kind: 'center', value: rect.x + rect.width / 2 },
      { kind: 'end', value: rect.x + rect.width }
    ]
  }
  return [
    { kind: 'start', value: rect.y },
    { kind: 'center', value: rect.y + rect.height / 2 },
    { kind: 'end', value: rect.y + rect.height }
  ]
}

/**
 * 6-anchor alignment solver (X: left/center/right; Y: top/middle/bottom) returning
 * snapped `{ x, y }` coordinates and visual alignment guide lines (`SnapGuide[]`).
 */
export function solveFrameSnap(
  movingRect: TdsCanvasRect,
  others: readonly TdsCanvasRect[],
  thresholdWorldPx = DEFAULT_SNAP_THRESHOLD_PX
): FrameSnapResult {
  if (others.length === 0 || !Number.isFinite(thresholdWorldPx) || thresholdWorldPx <= 0) {
    return {
      x: movingRect.x,
      y: movingRect.y,
      snappedX: false,
      snappedY: false,
      guides: []
    }
  }

  const EPSILON = 1e-3

  const findAxisBestDelta = (axis: 'x' | 'y'): { snapped: boolean; delta: number } => {
    const movingAnchors = getRectAxisAnchors(movingRect, axis)
    let bestDelta = 0
    let bestAbs = thresholdWorldPx + EPSILON
    let snapped = false

    for (const other of others) {
      const targetAnchors = getRectAxisAnchors(other, axis)
      for (const m of movingAnchors) {
        for (const t of targetAnchors) {
          const delta = t.value - m.value
          const abs = Math.abs(delta)
          if (abs <= thresholdWorldPx && abs < bestAbs - EPSILON) {
            bestAbs = abs
            bestDelta = delta
            snapped = true
          }
        }
      }
    }

    return { snapped, delta: snapped ? bestDelta : 0 }
  }

  const bestX = findAxisBestDelta('x')
  const bestY = findAxisBestDelta('y')

  const snappedRect: TdsCanvasRect = {
    x: movingRect.x + bestX.delta,
    y: movingRect.y + bestY.delta,
    width: movingRect.width,
    height: movingRect.height
  }

  const guides: SnapGuide[] = []

  const collectAxisGuides = (axis: 'x' | 'y'): void => {
    const snappedAnchors = getRectAxisAnchors(snappedRect, axis)
    const byPosition = new Map<string, SnapGuide>()

    for (const other of others) {
      const targetAnchors = getRectAxisAnchors(other, axis)
      for (const m of snappedAnchors) {
        for (const t of targetAnchors) {
          if (Math.abs(t.value - m.value) <= EPSILON) {
            const perpStart =
              axis === 'x' ? Math.min(snappedRect.y, other.y) : Math.min(snappedRect.x, other.x)
            const perpEnd =
              axis === 'x'
                ? Math.max(snappedRect.y + snappedRect.height, other.y + other.height)
                : Math.max(snappedRect.x + snappedRect.width, other.x + other.width)
            const key = `${axis}:${Math.round(t.value * 100)}`
            const existing = byPosition.get(key)
            if (existing) {
              existing.start = Math.min(existing.start, perpStart)
              existing.end = Math.max(existing.end, perpEnd)
            } else {
              byPosition.set(key, {
                axis,
                position: t.value,
                start: perpStart,
                end: perpEnd,
                anchor: m.kind
              })
            }
          }
        }
      }
    }

    for (const guide of byPosition.values()) {
      guides.push(guide)
    }
  }

  if (bestX.snapped) collectAxisGuides('x')
  if (bestY.snapped) collectAxisGuides('y')

  return {
    x: snappedRect.x,
    y: snappedRect.y,
    snappedX: bestX.snapped,
    snappedY: bestY.snapped,
    guides
  }
}

/**
 * Deterministic grid auto-layout preserving frame ordering.
 */
export function arrangeFramesGrid(
  frames: readonly TdsCanvasFrame[],
  options: ArrangeFramesOptions = {}
): TdsCanvasFrame[] {
  if (frames.length === 0) return []

  const gapX =
    options.gapX !== undefined && Number.isFinite(options.gapX) && options.gapX >= 0
      ? options.gapX
      : DEFAULT_GRID_GAP_X
  const gapY =
    options.gapY !== undefined && Number.isFinite(options.gapY) && options.gapY >= 0
      ? options.gapY
      : DEFAULT_GRID_GAP_Y
  const originX =
    options.originX !== undefined && Number.isFinite(options.originX) ? options.originX : 0
  const originY =
    options.originY !== undefined && Number.isFinite(options.originY) ? options.originY : 0

  const columns =
    options.columns !== undefined && Number.isFinite(options.columns) && options.columns >= 1
      ? Math.floor(options.columns)
      : frames.length <= 3
        ? frames.length
        : Math.min(4, Math.ceil(Math.sqrt(frames.length)))

  const result: TdsCanvasFrame[] = []
  let cursorX = originX
  let cursorY = originY
  let rowMaxHeight = 0

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i]!
    const colIndex = i % columns
    if (colIndex === 0 && i > 0) {
      cursorX = originX
      cursorY += rowMaxHeight + gapY
      rowMaxHeight = 0
    }

    const size = resolveFrameOuterSize(frame)
    result.push({
      ...frame,
      x: Math.round(cursorX),
      y: Math.round(cursorY)
    })

    cursorX += size.width + gapX
    rowMaxHeight = Math.max(rowMaxHeight, size.height)
  }

  return result
}

/**
 * Computes a centered pan/zoom viewport that fits all frames inside `containerSize`
 * with symmetric `padding` without upscaling past 1:1.
 */
export function computeViewportFit(
  frames: readonly TdsCanvasFrame[],
  containerSize: TdsCanvasSize,
  padding = 48
): TdsCanvasViewport {
  if (
    frames.length === 0 ||
    !Number.isFinite(containerSize.width) ||
    !Number.isFinite(containerSize.height) ||
    containerSize.width <= 0 ||
    containerSize.height <= 0
  ) {
    return { k: 1, tx: 0, ty: 0 }
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const frame of frames) {
    const rect = getFrameWorldRect(frame)
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y - FRAME_HEADER_ALLOWANCE_PX)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }

  const contentW = Math.max(1, maxX - minX)
  const contentH = Math.max(1, maxY - minY)
  const safePadding = Math.max(0, Number.isFinite(padding) ? padding : 0)
  const availW = Math.max(1, containerSize.width - safePadding * 2)
  const availH = Math.max(1, containerSize.height - safePadding * 2)

  const rawScale = Math.min(availW / contentW, availH / contentH, 1)
  const k = clampCanvasZoom(Math.floor(rawScale * 10000) / 10000)
  const tx = (containerSize.width - contentW * k) / 2 - minX * k
  const ty = (containerSize.height - contentH * k) / 2 - minY * k

  return { k, tx, ty }
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * Sanitizes an embedded CSS string before placing it inside a `<style>` tag so
 * untrusted/theme CSS can never close the `<style>` element or open HTML comments/tags.
 */
export function sanitizeEmbeddedStyleCss(css: string): string {
  if (!css || typeof css !== 'string') return ''
  const trimmed = css.trim()
  if (!trimmed) return ''
  return trimmed
    .replace(/<\/(\s*style)/gi, '<\\/$1')
    .replace(/<!--/g, '<\\!--')
    .replace(/-->/g, '--\\>')
    .replace(/<(\s*script)/gi, '<\\$1')
}

function injectStyleBlockIntoHtml(source: string, styleBlock: string): string {
  if (!styleBlock) return source
  if (/<\/head>/i.test(source)) {
    return source.replace(/<\/head>/i, (match) => `${styleBlock}${match}`)
  }
  if (/<head\b[^>]*>/i.test(source)) {
    return source.replace(/<head\b[^>]*>/i, (match) => `${match}${styleBlock}`)
  }
  if (/<!doctype[^>]*>/i.test(source)) {
    return source.replace(/<!doctype[^>]*>/i, (match) => `${match}${styleBlock}`)
  }
  return `${styleBlock}${source}`
}

export function getFrameIframeSandbox(kind: TdsCanvasFrameKind): string {
  return kind === 'html' ? 'allow-scripts allow-forms allow-modals' : ''
}

/**
 * Outer-CSP double-sandboxed `srcdoc` builder mirroring `WorkspaceFileViewer`:
 * enforces `default-src 'none'` with zero network exfiltration and opaque origin.
 * Optionally injects a sanitized `<style data-tds-theme-pack>` block inside the
 * sandboxed frame so TDS Theme Pack tokens cascade into HTML and SVG screens.
 */
export function buildSandboxedFrameSrcdoc(
  source: string,
  kind: TdsCanvasFrameKind,
  extraStyleCss?: string
): string {
  if (!source) return ''
  const safeCss = extraStyleCss ? sanitizeEmbeddedStyleCss(extraStyleCss) : ''
  const styleBlock = safeCss ? `<style data-tds-theme-pack>${safeCss}</style>` : ''
  const inner =
    kind === 'svg'
      ? `<!doctype html><meta charset="utf-8">${styleBlock}<body style="margin:0;width:100%;height:100%;display:grid;place-items:center;background:white">${source}</body>`
      : injectStyleBlockIntoHtml(source, styleBlock)
  const innerSandbox = getFrameIframeSandbox(kind)
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${TDS_CANVAS_FRAME_CSP}"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:white}iframe{display:block;width:100%;height:100%;border:0}</style><iframe sandbox="${innerSandbox}" srcdoc="${escapeHtmlAttribute(inner)}"></iframe>`
}

/**
 * Formats pending (unresolved) pin notes into a crisp structured prompt referencing
 * each frame's title, device preset, dimensions, and pin coordinates.
 */
export function formatNotesForAiPrompt(
  notes: readonly TdsCanvasNote[],
  frames: readonly TdsCanvasFrame[]
): TdsCanvasSendNotesPayload {
  const frameById = new Map<string, TdsCanvasFrame>(frames.map((frame) => [frame.id, frame]))
  const pending = notes.filter((note) => !note.resolved && note.text.trim().length > 0)
  if (pending.length === 0) {
    return { prompt: '', noteIds: [] }
  }

  const lines: string[] = [
    'Please update the design canvas frames based on these pinned review notes:',
    ''
  ]
  const noteIds: string[] = []

  pending.forEach((note, index) => {
    noteIds.push(note.id)
    const frame = frameById.get(note.frameId)
    const clampedX = Math.max(0, Math.min(1, Number.isFinite(note.xRatio) ? note.xRatio : 0))
    const clampedY = Math.max(0, Math.min(1, Number.isFinite(note.yRatio) ? note.yRatio : 0))
    const pctX = Math.round(clampedX * 100)
    const pctY = Math.round(clampedY * 100)

    if (frame) {
      const preset = getDevicePresetById(frame.deviceId)
      const logical = resolveFrameLogicalSize(frame)
      const pxX = Math.round(clampedX * logical.width)
      const pxY = Math.round(clampedY * logical.height)
      const deviceName = isResponsivePreset(preset) ? 'Responsive' : preset.name
      lines.push(
        `${index + 1}. [${frame.title} — ${deviceName} ${logical.width}×${logical.height} @ (${pctX}%, ${pctY}%) / (${pxX}px, ${pxY}px)] ${note.text.trim()}`
      )
    } else {
      lines.push(`${index + 1}. [Frame ${note.frameId} @ (${pctX}%, ${pctY}%)] ${note.text.trim()}`)
    }
  })

  return {
    prompt: lines.join('\n'),
    noteIds
  }
}
