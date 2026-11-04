export const PET_SIZE = 56
export const PET_WIDTH = Math.round(PET_SIZE * 1.8)
/** Gap between the element's bottom edge and the visible feet (the TuffEx viewBox is 36×20, feet at ~y17). */
export const FOOT_PAD = (PET_SIZE * 3) / 20
export const JUMP_REACH = PET_SIZE * 1.6
/** How far the walkable composer top stops short of the box edges. */
export const COMPOSER_INSET = 12

const GRAVITY = 1800
const WALL_RESTITUTION = 0.35
const LAND_RESTITUTION = 0.35
const MAX_JUMP_VX = 320
const LAND_BOUNCE_MIN = 90

export type SurfaceId = 'floor' | 'composer'

/** `y` is the visible feet line on the surface; the element bottom rests FOOT_PAD below it. */
export interface PetSurface {
  id: SurfaceId
  x0: number
  x1: number
  y: number
}

export interface PetBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export interface PetBody {
  x: number
  y: number
  vx: number
  vy: number
}

export type FallTier = 'none' | 'wince' | 'dizzy' | 'flat'

export function restBottom(surface: PetSurface): number {
  return surface.y + FOOT_PAD
}

export function standTop(surface: PetSurface): number {
  return restBottom(surface) - PET_SIZE
}

export function centreX(x: number): number {
  return x + PET_WIDTH / 2
}

export function surfaceUnder(
  body: PetBody,
  surfaces: readonly PetSurface[],
  tolerance = 1.5
): PetSurface | null {
  const bottom = body.y + PET_SIZE
  const cx = centreX(body.x)
  for (const surface of surfaces) {
    if (Math.abs(bottom - restBottom(surface)) <= tolerance && cx >= surface.x0 && cx <= surface.x1)
      return surface
  }
  return null
}

/** Upward velocity after an impact at `impactVy` (downward is positive); zero below the bounce threshold. */
export function reboundVelocity(impactVy: number): number {
  return impactVy > LAND_BOUNCE_MIN ? -impactVy * LAND_RESTITUTION : 0
}

export interface AirStep {
  body: PetBody
  peakTop: number
  landed: PetSurface | null
  fallHeight: number
  bumped: -1 | 0 | 1
}

export function stepAir(
  body: PetBody,
  peakTop: number,
  dt: number,
  bounds: PetBounds,
  surfaces: readonly PetSurface[],
  gravity = GRAVITY
): AirStep {
  let { x, y, vx, vy } = body
  const prevBottom = y + PET_SIZE
  vy += gravity * dt
  x += vx * dt
  y += vy * dt

  let bumped: -1 | 0 | 1 = 0
  if (x < bounds.left) {
    x = bounds.left
    vx = -vx * WALL_RESTITUTION
    bumped = -1
  } else if (x + PET_WIDTH > bounds.right) {
    x = bounds.right - PET_WIDTH
    vx = -vx * WALL_RESTITUTION
    bumped = 1
  }
  if (y < bounds.top) {
    y = bounds.top
    vy = Math.abs(vy) * 0.3
  }

  const peak = Math.min(peakTop, y)
  if (vy > 0) {
    const cx = centreX(x)
    for (const surface of surfaces) {
      const rest = restBottom(surface)
      const captured =
        surface.id === 'composer'
          ? cx >= surface.x0 - COMPOSER_INSET - PET_WIDTH / 2 &&
            cx <= surface.x1 + COMPOSER_INSET + PET_WIDTH / 2 &&
            y + PET_SIZE >= rest
          : prevBottom <= rest + 1 && y + PET_SIZE >= rest && cx >= surface.x0 && cx <= surface.x1
      if (captured) {
        const top = standTop(surface)
        const fallHeight = Math.max(0, top - peak)
        const bounce = reboundVelocity(vy)
        return {
          body: { x, y: top, vx: vx * 0.5, vy: bounce },
          peakTop: peak,
          landed: surface,
          fallHeight,
          bumped
        }
      }
    }
  }
  return { body: { x, y, vx, vy }, peakTop: peak, landed: null, fallHeight: 0, bumped }
}

export function classifyFall(height: number): FallTier {
  if (height < 24) return 'none'
  if (height < 90) return 'wince'
  if (height < 240) return 'dizzy'
  return 'flat'
}

/** Launch velocity for a jump from `from` onto `to`, or null when the rise is beyond reach. */
export function planJump(
  from: PetSurface,
  to: PetSurface,
  bodyX: number,
  targetCentreX: number
): { vx: number; vy: number } | null {
  const rise = restBottom(from) - restBottom(to)
  if (rise > JUMP_REACH) return null
  const apex = Math.max(rise, 0) + 14
  const vy = -Math.sqrt(2 * GRAVITY * apex)
  const discriminant = vy * vy - 2 * GRAVITY * rise
  const time = (-vy + Math.sqrt(Math.max(discriminant, 0))) / GRAVITY
  const vx = (targetCentreX - centreX(bodyX)) / Math.max(time, 0.05)
  return { vx: Math.max(-MAX_JUMP_VX, Math.min(MAX_JUMP_VX, vx)), vy }
}

export function stepWalk(
  x: number,
  dir: -1 | 1,
  speed: number,
  dt: number,
  surface: PetSurface
): { x: number; atEdge: boolean } {
  const wanted = centreX(x) + dir * speed * dt
  const clamped = Math.min(surface.x1, Math.max(surface.x0, wanted))
  return { x: clamped - PET_WIDTH / 2, atEdge: clamped !== wanted }
}

export function clampToBounds(x: number, bounds: PetBounds): number {
  return Math.min(bounds.right - PET_WIDTH, Math.max(bounds.left, x))
}
