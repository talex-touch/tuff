// Adapted from Amicro. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { PhysicsScene } from './scene-model'
import type { PhysicsMotionSource, PhysicsMotionVariant } from './types'
import { graphicScenes } from './scenes-graphics'
import { mechanicalScenes } from './scenes-mechanics'
import { paperScenes } from './scenes-paper'
import { PHYSICS_MOTION_VARIANTS } from './types'

export const physicsScenes = {
  ...paperScenes,
  ...mechanicalScenes,
  ...graphicScenes,
} satisfies Record<PhysicsMotionVariant, PhysicsScene>

/** Original symbols and immutable source paths for every independently retained effect. */
export const PHYSICS_MOTION_SOURCES: readonly PhysicsMotionSource[] =
  PHYSICS_MOTION_VARIANTS.map(variant => physicsScenes[variant].source)
