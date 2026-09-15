// Core DOM-free functions: they consume icon data and produce `d` strings and numbers.
// Pipeline: normalize → resample → match → align → plan → interpolate(t) → d
export { allocOutputs, interpLinear, interpPolar } from './core/interpolate'
export { fitIcon, iconToCubics, KAPPA, type ViewBox } from './core/normalize'
export { parsePath, type RawSeg, type RawSubpath } from './core/parse'
export {
  alignPair,
  buildPlan,
  centroid,
  polyLen,
  procrustes,
  reversePts,
  rotatePts,
  type Alignment,
  type MorphPlan,
  type PlanItem,
  type Similarity,
} from './core/plan'
export {
  arcLength,
  CORNER_THRESHOLD,
  detectCorners,
  resampleIcon,
  resamplePath,
} from './core/resample'
export { cubicsToPathD, serialize } from './core/serialize'
export { Spring, SPRING_PRESETS, type SpringPreset } from './core/spring'
export type {
  CubicPath,
  IconInput,
  IconNode,
  IconNodeAttrs,
  Sampled,
} from './core/types'

// DOM driver & lifecycle controller
export {
  computeInitialD,
  createController,
  type MorphCtrlProps,
  type MorphHandle,
  type MorphModeProps,
  type MorphWatchProps,
} from './dom/controller'
export {
  canonicalD,
  createMorph,
  type CreateMorphOptions,
  type Morph,
  type MorphOptions,
  type PathEl,
  type ReducedMotionMode,
} from './dom/index'

// Format adapters (svgToIcon, maskTarget, canvasTarget)
export {
  canvasTarget,
  maskTarget,
  svgToIcon,
  type Canvas2DContext,
  type CanvasSurface,
  type CanvasTargetOptions,
  type MaskEl,
  type MaskPathEl,
  type MaskStyle,
  type MaskTargetOptions,
} from './adapters/index'
