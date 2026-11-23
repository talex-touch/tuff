import type { FoldCornerPosition, FoldPageDirection, FoldPageStyle } from './types'

export interface Point2D {
  x: number
  y: number
}

export interface FoldPagePanelLayout {
  index: number
  tx: number
  ty: number
  tz: number
  rotateAxis: 'X' | 'Y'
  rotateDeg: number
  transform: string
  transformOrigin: string
  left: number
  top: number
  width: number
  height: number
  zIndex: number
  isWing: boolean
  coverRotateTransform: string
  shadeOpacity: number
  highlightOpacity: number
}

export interface FoldPageLayoutInput {
  count: number
  width: number
  height: number
  progress: number
  direction: FoldPageDirection
  foldStyle: FoldPageStyle
  foldAngle?: number
  creaseOpacity?: number
}

export interface FoldPageLayoutResult {
  panels: FoldPagePanelLayout[]
  projectedSpan: number
  fullSpan: number
  angleDeg: number
}

export interface CornerPeelInput {
  width: number
  height: number
  corner: FoldCornerPosition
  tipX: number
  tipY: number
  progress: number
  creaseOpacity?: number
}

export interface CornerPeelGeometry {
  active: boolean
  frontVisible: boolean
  cornerPoint: Point2D
  tipPoint: Point2D
  frontPolygon: Point2D[]
  flapPolygon: Point2D[]
  frontClipPath: string
  flapClipPath: string
  flapMatrix: string
  reflectionMatrix: [number, number, number, number, number, number]
  creaseAngleDeg: number
  sheenAngleDeg: number
  shadowOffsetX: number
  shadowOffsetY: number
  shadowBlur: number
  shadowAlpha: number
}

const EPSILON = 1e-6

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return clamp(value, 0, 1)
}

function roundPx(value: number): number {
  return Math.round(value * 1000) / 1000
}

function remapWindow(value: number, start: number, end: number): number {
  if (end <= start)
    return clamp01(value)
  return clamp01((value - start) / (end - start))
}

export function normalizeFoldPanelCount(value: unknown, fallback = 3): number {
  const numericFallback = Number.isFinite(fallback) ? Math.max(2, Math.floor(fallback)) : 3
  if (typeof value !== 'number' || !Number.isFinite(value))
    return numericFallback
  return Math.max(2, Math.floor(value))
}

export function computeFoldPageLayout(input: FoldPageLayoutInput): FoldPageLayoutResult {
  const count = normalizeFoldPanelCount(input.count, 2)
  const width = Math.max(1, Number.isFinite(input.width) ? input.width : 540)
  const height = Math.max(1, Number.isFinite(input.height) ? input.height : 240)
  const progress = clamp01(input.progress)
  const creaseOpacity = clamp(input.creaseOpacity ?? 0.28, 0, 1)
  const isHorizontal = input.direction === 'horizontal'
  const fullSpan = isHorizontal ? width : height
  const panelSpan = fullSpan / count
  const panels: FoldPagePanelLayout[] = []

  if (input.foldStyle === 'gate') {
    const baseMaxAngle = clamp(input.foldAngle ?? 172, 20, 176)
    const closedness = 1 - progress

    if (count === 2) {
      const phi = closedness * baseMaxAngle
      const transformOrigin = isHorizontal ? 'left center' : 'center top'
      const rotateAxis = isHorizontal ? 'Y' : 'X'
      const rotateDeg = isHorizontal ? -phi : phi
      const coverRotateTransform = isHorizontal ? 'rotateY(180deg)' : 'rotateX(180deg)'

      panels.push({
        index: 0,
        tx: 0,
        ty: 0,
        tz: 0,
        rotateAxis,
        rotateDeg: 0,
        transform: 'translate3d(0px, 0px, 0px)',
        transformOrigin: 'center center',
        left: 0,
        top: 0,
        width: isHorizontal ? panelSpan : width,
        height: isHorizontal ? height : panelSpan,
        zIndex: 1,
        isWing: false,
        coverRotateTransform,
        shadeOpacity: roundPx(closedness * creaseOpacity * 0.28),
        highlightOpacity: 0,
      })

      panels.push({
        index: 1,
        tx: 0,
        ty: 0,
        tz: 1.5,
        rotateAxis,
        rotateDeg: roundPx(rotateDeg),
        transform: `translate3d(0px, 0px, 1.5px) rotate${rotateAxis}(${roundPx(rotateDeg)}deg)`,
        transformOrigin,
        left: isHorizontal ? panelSpan : 0,
        top: isHorizontal ? 0 : panelSpan,
        width: isHorizontal ? panelSpan : width,
        height: isHorizontal ? height : panelSpan,
        zIndex: 2,
        isWing: true,
        coverRotateTransform,
        shadeOpacity: roundPx(Math.sin((phi * Math.PI) / 180) * creaseOpacity * 0.65),
        highlightOpacity: roundPx(Math.sin((phi * Math.PI) / 180) * creaseOpacity * 0.45),
      })

      return {
        panels,
        projectedSpan: roundPx(panelSpan + panelSpan * Math.abs(Math.cos((phi * Math.PI) / 180))),
        fullSpan,
        angleDeg: roundPx(phi),
      }
    }

    // Staggered tri-fold (or outer wings over static middle spread for count > 3).
    // Keep the outer cover wing strictly in front of the inner wing at all points
    // along the flap so their rotated planes never intersect in 3D space.
    const rightClosed = remapWindow(closedness, 0, 0.88)
    const leftClosed = remapWindow(closedness, 0.12, 1)
    const rightMaxAngle = clamp(baseMaxAngle + 4, 20, 177)
    const leftMaxAngle = clamp(baseMaxAngle - 4, 20, 168)
    const rightPhi = rightClosed * rightMaxAngle
    const leftPhi = leftClosed * leftMaxAngle
    const rightZ = rightClosed > 0 ? 1 : 0
    const leftRad = (leftPhi * Math.PI) / 180
    const rightRad = (rightPhi * Math.PI) / 180
    const cosL = Math.cos(leftRad)
    const sinL = Math.sin(leftRad)
    const cosR = Math.cos(rightRad)
    const sinR = Math.sin(rightRad)
    const leftHinge = panelSpan
    const rightHinge = (count - 1) * panelSpan
    const xL0 = leftHinge
    const xL1 = leftHinge - panelSpan * cosL
    const xR0 = rightHinge
    const xR1 = rightHinge + panelSpan * cosR
    const xMin = Math.max(Math.min(xL0, xL1), Math.min(xR0, xR1))
    const xMax = Math.min(Math.max(xL0, xL1), Math.max(xR0, xR1))
    const clearance = Math.max(4, panelSpan * 0.025)
    const ramp = Math.min(1, leftClosed / 0.12)
    let neededZ = (rightZ + clearance) * ramp

    if (xMax > xMin + 1e-4 && Math.abs(cosL) > 1e-6 && Math.abs(cosR) > 1e-6) {
      for (const x of [xMin, xMax]) {
        const u = clamp((leftHinge - x) / cosL, 0, panelSpan)
        const v = clamp((x - rightHinge) / cosR, 0, panelSpan)
        const zLRel = u * sinL
        const zR = rightZ + v * sinR
        neededZ = Math.max(neededZ, zR - zLRel + clearance)
      }
    }

    const leftBaseZ = leftClosed > 0
      ? roundPx(Math.max(Math.max(12, panelSpan * 0.08) * ramp, neededZ))
      : 0
    const rotateAxis = isHorizontal ? 'Y' : 'X'
    const coverRotateTransform = isHorizontal ? 'rotateY(180deg)' : 'rotateX(180deg)'

    for (let i = 0; i < count; i++) {
      const left = isHorizontal ? i * panelSpan : 0
      const top = isHorizontal ? 0 : i * panelSpan
      const panelW = isHorizontal ? panelSpan : width
      const panelH = isHorizontal ? height : panelSpan

      if (i === 0) {
        const rotateDeg = isHorizontal ? leftPhi : -leftPhi
        const tz = leftClosed > 0 ? leftBaseZ : 0
        panels.push({
          index: i,
          tx: 0,
          ty: 0,
          tz,
          rotateAxis,
          rotateDeg: roundPx(rotateDeg),
          transform: `translate3d(0px, 0px, ${tz}px) rotate${rotateAxis}(${roundPx(rotateDeg)}deg)`,
          transformOrigin: isHorizontal ? 'right center' : 'center bottom',
          left,
          top,
          width: panelW,
          height: panelH,
          zIndex: 3,
          isWing: true,
          coverRotateTransform,
          shadeOpacity: roundPx(Math.sin((leftPhi * Math.PI) / 180) * creaseOpacity * 0.65),
          highlightOpacity: roundPx(Math.sin((leftPhi * Math.PI) / 180) * creaseOpacity * 0.48),
        })
      }
      else if (i === count - 1) {
        const rotateDeg = isHorizontal ? -rightPhi : rightPhi
        const tz = rightClosed > 0 ? 1 : 0
        panels.push({
          index: i,
          tx: 0,
          ty: 0,
          tz,
          rotateAxis,
          rotateDeg: roundPx(rotateDeg),
          transform: `translate3d(0px, 0px, ${tz}px) rotate${rotateAxis}(${roundPx(rotateDeg)}deg)`,
          transformOrigin: isHorizontal ? 'left center' : 'center top',
          left,
          top,
          width: panelW,
          height: panelH,
          zIndex: 2,
          isWing: true,
          coverRotateTransform,
          shadeOpacity: roundPx(Math.sin((rightPhi * Math.PI) / 180) * creaseOpacity * 0.6),
          highlightOpacity: roundPx(Math.sin((rightPhi * Math.PI) / 180) * creaseOpacity * 0.42),
        })
      }
      else {
        panels.push({
          index: i,
          tx: 0,
          ty: 0,
          tz: 0,
          rotateAxis,
          rotateDeg: 0,
          transform: 'translate3d(0px, 0px, 0px)',
          transformOrigin: 'center center',
          left,
          top,
          width: panelW,
          height: panelH,
          zIndex: 1,
          isWing: false,
          coverRotateTransform,
          shadeOpacity: roundPx(closedness * creaseOpacity * 0.24),
          highlightOpacity: 0,
        })
      }
    }

    const projectedSpan = panelSpan * (count - 2)
      + panelSpan * Math.abs(Math.cos((leftPhi * Math.PI) / 180))
      + panelSpan * Math.abs(Math.cos((rightPhi * Math.PI) / 180))

    return {
      panels,
      projectedSpan: roundPx(projectedSpan),
      fullSpan,
      angleDeg: roundPx(Math.max(leftPhi, rightPhi)),
    }
  }

  // Concertina / accordion mode
  const maxAngle = clamp(input.foldAngle ?? 68, 5, 86)
  const thetaDeg = (1 - progress) * maxAngle
  const thetaRad = (thetaDeg * Math.PI) / 180
  const cosT = Math.cos(thetaRad)
  const sinT = Math.sin(thetaRad)
  const s = panelSpan * cosT
  const d = panelSpan * sinT
  const projectedSpan = count * s
  const startOffset = (fullSpan - projectedSpan) / 2
  const rotateAxis = isHorizontal ? 'Y' : 'X'
  const transformOrigin = isHorizontal ? 'left center' : 'center top'
  const coverRotateTransform = isHorizontal ? 'rotateY(180deg)' : 'rotateX(180deg)'

  for (let i = 0; i < count; i++) {
    const isEven = i % 2 === 0
    const spanPos = startOffset + i * s
    const tx = isHorizontal ? spanPos : 0
    const ty = isHorizontal ? 0 : spanPos
    const tz = isEven ? 0 : -d
    const rotateDeg = isHorizontal
      ? (isEven ? thetaDeg : -thetaDeg)
      : (isEven ? -thetaDeg : thetaDeg)

    panels.push({
      index: i,
      tx: roundPx(tx),
      ty: roundPx(ty),
      tz: roundPx(tz),
      rotateAxis,
      rotateDeg: roundPx(rotateDeg),
      transform: `translate3d(${roundPx(tx)}px, ${roundPx(ty)}px, ${roundPx(tz)}px) rotate${rotateAxis}(${roundPx(rotateDeg)}deg)`,
      transformOrigin,
      left: 0,
      top: 0,
      width: isHorizontal ? panelSpan : width,
      height: isHorizontal ? height : panelSpan,
      zIndex: count - i,
      isWing: false,
      coverRotateTransform,
      shadeOpacity: isEven ? 0 : roundPx(sinT * creaseOpacity),
      highlightOpacity: isEven ? roundPx(sinT * creaseOpacity * 0.72) : 0,
    })
  }

  return {
    panels,
    projectedSpan: roundPx(projectedSpan),
    fullSpan,
    angleDeg: roundPx(thetaDeg),
  }
}

export function getCornerPoint(corner: FoldCornerPosition, width: number, height: number): Point2D {
  switch (corner) {
    case 'top-left':
      return { x: 0, y: 0 }
    case 'top-right':
      return { x: width, y: 0 }
    case 'bottom-left':
      return { x: 0, y: height }
    case 'bottom-right':
    default:
      return { x: width, y: height }
  }
}

export function getOppositeCornerPoint(corner: FoldCornerPosition, width: number, height: number): Point2D {
  switch (corner) {
    case 'top-left':
      return { x: width, y: height }
    case 'top-right':
      return { x: 0, y: height }
    case 'bottom-left':
      return { x: width, y: 0 }
    case 'bottom-right':
    default:
      return { x: 0, y: 0 }
  }
}

/**
 * Resolve corner tip coordinates from scalar progress `0..1`.
 * Moving the tip from `C` to `C + 2 * (O - C)` shifts the perpendicular
 * bisector smoothly from `C` (`0%` peeled) across `O` (`100%` peeled).
 */
export function resolveCornerTipFromProgress(
  corner: FoldCornerPosition,
  width: number,
  height: number,
  progress: number,
): Point2D {
  const c = getCornerPoint(corner, width, height)
  const o = getOppositeCornerPoint(corner, width, height)
  const p = clamp01(progress)
  return {
    x: c.x + 2 * p * (o.x - c.x),
    y: c.y + 2 * p * (o.y - c.y),
  }
}

export function clampCornerTip(
  corner: FoldCornerPosition,
  width: number,
  height: number,
  tipX: number,
  tipY: number,
): Point2D {
  const c = getCornerPoint(corner, width, height)
  const o = getOppositeCornerPoint(corner, width, height)
  const dx = 2 * (o.x - c.x)
  const dy = 2 * (o.y - c.y)
  const minX = Math.min(c.x, c.x + dx)
  const maxX = Math.max(c.x, c.x + dx)
  const minY = Math.min(c.y, c.y + dy)
  const maxY = Math.max(c.y, c.y + dy)
  return {
    x: clamp(tipX, minX, maxX),
    y: clamp(tipY, minY, maxY),
  }
}

export function projectPointerToPeelProgress(
  corner: FoldCornerPosition,
  width: number,
  height: number,
  pointerX: number,
  pointerY: number,
): number {
  const c = getCornerPoint(corner, width, height)
  const o = getOppositeCornerPoint(corner, width, height)
  const dx = o.x - c.x
  const dy = o.y - c.y
  const denom = 2 * (dx * dx + dy * dy)
  if (denom <= EPSILON)
    return 0
  return clamp01(((pointerX - c.x) * dx + (pointerY - c.y) * dy) / denom)
}

/**
 * Sutherland-Hodgman polygon clip against the half-plane `nx * x + ny * y >= k`
 * (or `<= k` when `keepGreater` is `false`).
 */
export function clipPolygonHalfPlane(
  polygon: Point2D[],
  nx: number,
  ny: number,
  k: number,
  keepGreater: boolean,
): Point2D[] {
  if (polygon.length < 3)
    return []
  const output: Point2D[] = []
  const sign = keepGreater ? 1 : -1

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const da = sign * (nx * a.x + ny * a.y - k)
    const db = sign * (nx * b.x + ny * b.y - k)
    const aIn = da >= -EPSILON
    const bIn = db >= -EPSILON

    if (aIn && bIn) {
      output.push(b)
    }
    else if (aIn && !bIn) {
      const denom = da - db
      if (Math.abs(denom) > EPSILON) {
        const t = da / denom
        output.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
      }
    }
    else if (!aIn && bIn) {
      const denom = da - db
      if (Math.abs(denom) > EPSILON) {
        const t = da / denom
        output.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
      }
      output.push(b)
    }
  }

  return dedupePolygon(output)
}

function dedupePolygon(points: Point2D[]): Point2D[] {
  if (points.length < 3)
    return []
  const cleaned: Point2D[] = []
  for (const pt of points) {
    const prev = cleaned[cleaned.length - 1]
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.05) {
      cleaned.push(pt)
    }
  }
  if (cleaned.length >= 2) {
    const first = cleaned[0]!
    const last = cleaned[cleaned.length - 1]!
    if (Math.hypot(first.x - last.x, first.y - last.y) <= 0.05) {
      cleaned.pop()
    }
  }
  return cleaned.length >= 3 ? cleaned : []
}

function polygonToClipPath(polygon: Point2D[], width: number, height: number): string {
  if (polygon.length < 3)
    return 'polygon(0% 0%, 0% 0%, 0% 0%)'
  const coords = polygon.map((pt) => {
    const xp = roundPx((pt.x / width) * 100)
    const yp = roundPx((pt.y / height) * 100)
    return `${xp}% ${yp}%`
  })
  return `polygon(${coords.join(', ')})`
}

export function computeCornerPeelGeometry(input: CornerPeelInput): CornerPeelGeometry {
  const width = Math.max(1, Number.isFinite(input.width) ? input.width : 320)
  const height = Math.max(1, Number.isFinite(input.height) ? input.height : 200)
  const creaseOpacity = clamp(input.creaseOpacity ?? 0.26, 0, 1)
  const cornerPoint = getCornerPoint(input.corner, width, height)
  const tipPoint = clampCornerTip(input.corner, width, height, input.tipX, input.tipY)

  const vx = tipPoint.x - cornerPoint.x
  const vy = tipPoint.y - cornerPoint.y
  const dist = Math.hypot(vx, vy)
  const progress = clamp01(input.progress)

  if (dist < 1) {
    return {
      active: false,
      frontVisible: true,
      cornerPoint,
      tipPoint: cornerPoint,
      frontPolygon: [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ],
      flapPolygon: [],
      frontClipPath: 'none',
      flapClipPath: 'polygon(0% 0%, 0% 0%, 0% 0%)',
      flapMatrix: 'matrix(1, 0, 0, 1, 0, 0)',
      reflectionMatrix: [1, 0, 0, 1, 0, 0],
      creaseAngleDeg: 0,
      sheenAngleDeg: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
      shadowAlpha: 0,
    }
  }

  const nx = vx / dist
  const ny = vy / dist
  const mx = (cornerPoint.x + tipPoint.x) / 2
  const my = (cornerPoint.y + tipPoint.y) / 2
  const k = nx * mx + ny * my

  const cardRect: Point2D[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]

  const frontPolygon = clipPolygonHalfPlane(cardRect, nx, ny, k, true)
  const flapPolygon = clipPolygonHalfPlane(cardRect, nx, ny, k, false)

  // Reflection across line n·p = k:
  // x' = (1 - 2 nx^2) x + (-2 nx ny) y + 2 k nx
  // y' = (-2 nx ny) x + (1 - 2 ny^2) y + 2 k ny
  const a = 1 - 2 * nx * nx
  const b = -2 * nx * ny
  const c = b
  const d = 1 - 2 * ny * ny
  const tx = 2 * k * nx
  const ty = 2 * k * ny

  const reflectionMatrix: [number, number, number, number, number, number] = [
    roundPx(a),
    roundPx(b),
    roundPx(c),
    roundPx(d),
    roundPx(tx),
    roundPx(ty),
  ]

  const creaseAngleDeg = roundPx((Math.atan2(ny, nx) * 180) / Math.PI)
  const sheenAngleDeg = roundPx(creaseAngleDeg + 90)
  const liftFactor = Math.sin(Math.PI * clamp(progress, 0.04, 0.96))

  return {
    active: flapPolygon.length >= 3,
    frontVisible: frontPolygon.length >= 3,
    cornerPoint,
    tipPoint: { x: roundPx(tipPoint.x), y: roundPx(tipPoint.y) },
    frontPolygon,
    flapPolygon,
    frontClipPath: frontPolygon.length >= 3 ? polygonToClipPath(frontPolygon, width, height) : 'polygon(0% 0%, 0% 0%, 0% 0%)',
    flapClipPath: polygonToClipPath(flapPolygon, width, height),
    flapMatrix: `matrix(${reflectionMatrix.join(', ')})`,
    reflectionMatrix,
    creaseAngleDeg,
    sheenAngleDeg,
    shadowOffsetX: roundPx(-nx * (4 + 10 * liftFactor)),
    shadowOffsetY: roundPx(-ny * (4 + 10 * liftFactor) + 4),
    shadowBlur: roundPx(8 + 14 * liftFactor),
    shadowAlpha: roundPx(creaseOpacity * (0.45 + 0.55 * liftFactor)),
  }
}
