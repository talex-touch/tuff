// Ported from Amicro, commit 43c29ce9cdd16459e3eab4992381b8d35b38776a.
// MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { LoaderNode } from './scene-types'
import type { MotionLoaderVariant } from './types'
import { BAR_SCENES } from './scene-families/bars'
import { DOTS_GRID_SCENES } from './scene-families/dots-grid'
import { DOTS_LINEAR_SCENES } from './scene-families/dots-linear'
import { DOTS_ORBITAL_SCENES } from './scene-families/dots-orbital'
import { RING_SCENES } from './scene-families/rings'
import { SHAPE_SCENES } from './scene-families/shapes'
import { SURFACE_SCENES } from './scene-families/surfaces'
import { TEXT_SCENES } from './scene-families/text'
import { buildWavePhysicsScene } from './wave-physics'

/** Assemble the literal source families; physics geometry retains its lazy cache. */
const SCENES: Record<Exclude<MotionLoaderVariant, 'wave-physics-loader'>, LoaderNode> & {
  'wave-physics-loader'?: LoaderNode
} = {
  ...BAR_SCENES,
  ...DOTS_GRID_SCENES,
  ...DOTS_LINEAR_SCENES,
  ...DOTS_ORBITAL_SCENES,
  ...RING_SCENES,
  ...SHAPE_SCENES,
  ...SURFACE_SCENES,
  ...TEXT_SCENES,
}

export { MOTION_LOADER_SOURCES } from './sources'

export function getLoaderScene(variant: MotionLoaderVariant): LoaderNode {
  if (variant === 'wave-physics-loader')
    return SCENES[variant] ?? (SCENES[variant] = buildWavePhysicsScene())
  return SCENES[variant]!
}
