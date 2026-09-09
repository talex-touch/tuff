// The text-morph engine: a port of https://github.com/lochie/torph (MIT © lochie),
// fused with tuffex's own spring compiler. See each file's header for what was
// changed and why. Nothing here imports Vue — the Vue surface is TxTextMorph.vue.

export { MorphController, type MorphControllerOptions } from './controller'
export { diffSegments, type DiffOptions, type DiffResult } from './diff'
export { DEFAULT_MORPH_TAG, TextMorphEngine } from './morph'
export { isNumericWord, segmentNumber } from './number'
export { segmentText } from './segment'
export {
  MORPH_DEFAULTS,
  type MorphSegment,
  type MorphSegmentKind,
  type MorphSpring,
  type TextMorphEngineOptions,
} from './types'
