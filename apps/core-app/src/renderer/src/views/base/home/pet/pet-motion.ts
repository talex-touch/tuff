import type { MikoState } from '@talex-touch/tuffex/miko'
import type { PetBounds, PetSurface } from './pet-physics'
import { COMPOSER_INSET, FOOT_PAD, PET_WIDTH } from './pet-physics'

export type PetPose =
  | 'idle'
  | 'sit'
  | 'walk'
  | 'climb'
  | 'sleep'
  | 'stretch'
  | 'fall'
  | 'hang'
  | 'flat'
  | 'dizzy'
  | 'wince'
  | 'purr'
  | 'celebrate'
  | 'eat'
  | 'sleepy'
  | 'coffee'
  | 'fly'
  | 'zerog'
  | 'juggle'
  | 'ball'
  | 'swim'
  | 'thinking'
  | 'writing'
  | 'curious'
  | 'bathe'
  | 'shake'
  | 'box'

const POSE_STATE: Record<PetPose, MikoState> = {
  idle: 'idle',
  sit: 'idle',
  walk: 'running',
  climb: 'running',
  sleep: 'sleeping',
  stretch: 'stretching',
  fall: 'stretching',
  hang: 'curious',
  flat: 'sleeping',
  dizzy: 'dizzy',
  wince: 'alert',
  purr: 'purring',
  celebrate: 'celebrating',
  eat: 'eating',
  sleepy: 'sleepy',
  coffee: 'coffee',
  fly: 'celebrating',
  zerog: 'space',
  juggle: 'juggling',
  ball: 'sleeping',
  swim: 'running',
  thinking: 'thinking',
  writing: 'working',
  curious: 'curious',
  bathe: 'bathing',
  shake: 'idle',
  box: 'box'
}

export function stateFor(pose: PetPose): MikoState {
  return POSE_STATE[pose]
}

export interface PlayField {
  surfaces: PetSurface[]
  composer: PetSurface | null
  bounds: PetBounds
  /** Centre x values where the pet's body would overlap the composer box; floor walks never enter it. */
  zone: { x0: number; x1: number } | null
}

interface PlainRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
}

/** Rects arrive in viewport space; the field is expressed in the overlay's own coordinates. */
export function buildField(stage: PlainRect, body: PlainRect, box: PlainRect | null): PlayField {
  const ox = stage.left
  const oy = stage.top
  const bounds: PetBounds = {
    left: body.left - ox,
    right: body.right - ox,
    top: body.top - oy,
    bottom: body.bottom - oy
  }
  const floor: PetSurface = {
    id: 'floor',
    x0: bounds.left + 8,
    x1: bounds.right - 8,
    y: bounds.bottom - FOOT_PAD
  }
  const composer =
    box && box.width > 0
      ? {
          id: 'composer' as const,
          x0: box.left - ox + COMPOSER_INSET,
          x1: box.right - ox - COMPOSER_INSET,
          y: box.top - oy - 1
        }
      : null
  const zone =
    box && box.width > 0
      ? { x0: box.left - ox - PET_WIDTH / 2, x1: box.right - ox + PET_WIDTH / 2 }
      : null
  return { surfaces: composer ? [floor, composer] : [floor], composer, bounds, zone }
}

export interface Needs {
  energy: number
  boredom: number
  curiosity: number
}

export type PetAction =
  | 'patrol'
  | 'sit'
  | 'jump-up'
  | 'wall-up'
  | 'sleep'
  | 'stretch'
  | 'bathe'
  | 'curious'
  | 'shake'
  | 'sneeze'
  | 'hop'

export interface ActionContext {
  canJumpUp: boolean
  canClimbUp: boolean
  night: boolean
  morning: boolean
  friday: boolean
}

export function weightActions(needs: Needs, ctx: ActionContext): Array<[PetAction, number]> {
  const options: Array<[PetAction, number]> = [
    ['patrol', 2 + 4 * needs.energy + 2 * needs.curiosity],
    ['sit', 1 + 3 * needs.boredom],
    ['sleep', (ctx.night ? 3 : 0.3) * (1 - needs.energy) + 0.4 * needs.boredom],
    ['stretch', ctx.morning ? 2 : 0.4],
    ['bathe', 0.6],
    ['curious', 0.4 + 1.5 * needs.curiosity],
    ['shake', 0.5],
    ['sneeze', 0.3]
  ]
  if (ctx.canJumpUp) options.push(['jump-up', 1.4 + 1.2 * needs.curiosity])
  else if (ctx.canClimbUp) options.push(['wall-up', 1.2 + 1.2 * needs.curiosity])
  if (ctx.friday) options.push(['hop', 1.2])
  return options
}

export function pickAction(options: Array<[PetAction, number]>, roll: number): PetAction {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0)
  let at = roll * total
  for (const [action, weight] of options) {
    at -= weight
    if (at <= 0) return action
  }
  return options[0][0]
}

/** The button only ever moves; the pose (turn, roll, squash) lives on the inner element. */
export function positionOf(x: number, y: number): string {
  return `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
}

export interface PoseTransform {
  facing: 1 | -1
  angle?: number
  sx?: number
  sy?: number
}

export function poseOf(t: PoseTransform): string {
  return `scaleX(${(t.facing * (t.sx ?? 1)).toFixed(3)}) rotate(${(t.angle ?? 0).toFixed(1)}deg) scaleY(${(t.sy ?? 1).toFixed(3)})`
}
