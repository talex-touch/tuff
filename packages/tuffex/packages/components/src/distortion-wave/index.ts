import type { Plugin } from 'vue'
import { withInstall } from '../../../utils/withInstall'
import TxDistortionWaveSfc from './src/TxDistortionWave.vue'

const TxDistortionWave: typeof TxDistortionWaveSfc & Plugin = withInstall(TxDistortionWaveSfc)
const TuffDistortionWave: typeof TxDistortionWaveSfc & Plugin = TxDistortionWave
const DistortionWave: typeof TxDistortionWaveSfc & Plugin = TxDistortionWave

export { DistortionWave, TuffDistortionWave, TxDistortionWave }

export { WaveController } from './src/controller'
export type {
  PaletteLike as DistortionWavePaletteLike,
  PlayOptions as DistortionWavePlayOptions,
  SourceLike as DistortionWaveSourceLike,
  WaveOptions as DistortionWaveOptions,
  WaveStyleInput as DistortionWaveStyleInput,
} from './src/controller'

export {
  PALETTES as DISTORTION_WAVE_PALETTES,
  defaultStyle as defaultDistortionWaveStyle,
  duration as distortionWaveDuration,
  makeParticles as makeDistortionWaveParticles,
  newFront as newDistortionWaveFront,
  particleAt as distortionWaveParticleAt,
  rimLumps as distortionWaveRimLumps,
  singlePalette as singleDistortionWavePalette,
  waveFront as distortionWaveFront,
} from './src/model'
export type {
  Front as DistortionWaveFront,
  Palette as DistortionWavePalette,
  PaletteName as DistortionWavePaletteName,
  Particle as DistortionWaveParticle,
  Point as DistortionWavePoint,
  Rect as DistortionWaveRect,
  RGB as DistortionWaveRgb,
  Spot as DistortionWaveSpot,
  WaveStyle as DistortionWaveStyle,
  WaveType as DistortionWaveType,
} from './src/model'

export { WaveRenderer } from './src/renderer'
export type {
  DotBuffer as DistortionWaveDotBuffer,
  FrameOptions as DistortionWaveFrameOptions,
  RendererOptions as DistortionWaveRendererOptions,
  ScreenSlot as DistortionWaveScreenSlot,
} from './src/renderer'

export {
  backgroundOf as distortionWaveBackgroundOf,
  snapshot as distortionWaveSnapshot,
} from './src/capture'
export type {
  CaptureFunction as DistortionWaveCaptureFunction,
  CaptureRequest as DistortionWaveCaptureRequest,
  Snapshot as DistortionWaveSnapshot,
  SnapshotOptions as DistortionWaveSnapshotOptions,
} from './src/capture'

export type { DistortionWaveHandle, DistortionWaveProps } from './src/types'
export type TxDistortionWaveInstance = InstanceType<typeof TxDistortionWave>

export default TxDistortionWave
