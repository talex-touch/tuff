import type { PlayOptions, WaveController, WaveOptions } from './controller'

export interface DistortionWaveProps extends Omit<WaveOptions, 'onFinish'> {
  /** Callback fired when a wave finishes settling onto a view. */
  onFinish?: (revealed: boolean) => void
}

export interface DistortionWaveHandle {
  /** Runs the wave from the start. */
  play: (options?: PlayOptions) => void
  /** Runs the wave back to the first view. */
  reverse: () => void
  /** Jumps straight back to the first view without running a wave. */
  reset: () => void
  /** Pre-captures the element so the next wave starts immediately with its lens. */
  prepare: () => Promise<void>
  /** Root element hosting the wave. */
  readonly element: HTMLDivElement | null
  /** Underlying WaveController instance. */
  readonly controller: WaveController | null
}
