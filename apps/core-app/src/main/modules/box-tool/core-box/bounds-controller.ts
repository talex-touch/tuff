import type { CoreBoxSize } from './bounds'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { createLogger } from '../../../utils/logger'
import { calculateCoreBoxBounds } from './bounds'

const boundsLog = createLogger('CoreBox').child('Window')
const BOUNDS_ANIMATION_TASK_ID = 'core-box.window.bounds-animation'

interface BoundsAnimationState {
  browserWindow: Electron.BrowserWindow
  startBounds: Electron.Rectangle
  target: Electron.Rectangle
  startTime: number
  durationMs: number
  token: number
  restoreResizable: () => void
  minHeight?: number
}

export interface WindowBoundsControllerOptions {
  defaultWidth: number
  minHeight: number
  animationRetargetTolerance: number
  syncOverlayBounds: () => void
}

export class WindowBoundsController {
  private boundsAnimationTaskId: string | null = null
  private boundsAnimationToken = 0
  private currentAnimationTarget: Electron.Rectangle | null = null
  private boundsAnimationState: BoundsAnimationState | null = null
  private animationResizeRestore: (() => void) | null = null
  private lastSetBounds: { height: number; y: number } | null = null
  private customTopPercent: number | null = null
  private readonly pollingService = PollingService.getInstance()

  constructor(private readonly options: WindowBoundsControllerOptions) {}

  public calculateBounds(
    curScreen: Electron.Display,
    size: CoreBoxSize
  ): Electron.Rectangle | null {
    if (!curScreen?.bounds) {
      boundsLog.error('Invalid screen object', { meta: { screenId: curScreen?.id } })
      return null
    }

    const rect = curScreen.workArea ?? curScreen.bounds
    if (
      typeof rect.x !== 'number' ||
      typeof rect.y !== 'number' ||
      typeof rect.width !== 'number' ||
      typeof rect.height !== 'number'
    ) {
      boundsLog.error('Invalid screen rect received', {
        meta: {
          width: rect.width,
          height: rect.height,
          x: rect.x,
          y: rect.y
        }
      })
      return null
    }

    return calculateCoreBoxBounds(
      rect,
      size,
      this.customTopPercent,
      this.options.defaultWidth,
      this.options.minHeight
    )
  }

  public getCurrentBounds(browserWindow: Electron.BrowserWindow): Electron.Rectangle {
    const rawBounds = browserWindow.getBounds()
    return {
      ...rawBounds,
      height: this.lastSetBounds?.height ?? rawBounds.height,
      y: this.lastSetBounds?.y ?? rawBounds.y
    }
  }

  public getCurrentHeight(browserWindow: Electron.BrowserWindow): number {
    return this.lastSetBounds?.height ?? browserWindow.getBounds().height
  }

  public setBounds(browserWindow: Electron.BrowserWindow, bounds: Electron.Rectangle): void {
    browserWindow.setBounds(bounds, false)
    this.lastSetBounds = { height: bounds.height, y: bounds.y }
    this.options.syncOverlayBounds()
  }

  public updatePosition(browserWindow: Electron.BrowserWindow, curScreen: Electron.Display): void {
    const [rawWindowWidth, rawWindowHeight] = browserWindow.getSize()
    const bounds = this.calculateBounds(curScreen, {
      width: rawWindowWidth,
      height: rawWindowHeight
    })
    if (!bounds) return

    try {
      this.stopAnimation()
      browserWindow.setPosition(bounds.x, bounds.y)
    } catch (error) {
      boundsLog.error('Failed to set window position', { error })
    }
  }

  public setPositionOffset(topPercent: number): number {
    const safePercent = Math.max(0.1, Math.min(0.9, topPercent))
    this.customTopPercent = safePercent
    return safePercent
  }

  public resetPositionOffset(): void {
    this.customTopPercent = null
  }

  public stopAnimation(): void {
    if (this.boundsAnimationTaskId) {
      this.pollingService.unregister(this.boundsAnimationTaskId)
      this.boundsAnimationTaskId = null
    }
    this.currentAnimationTarget = null
    this.boundsAnimationState = null
    this.boundsAnimationToken += 1
    if (this.animationResizeRestore) {
      this.animationResizeRestore()
      this.animationResizeRestore = null
    }
  }

  public prepareTemporaryResize(browserWindow: Electron.BrowserWindow): () => void {
    if (browserWindow.isDestroyed()) return () => {}
    const wasResizable = browserWindow.isResizable()
    if (!wasResizable) {
      try {
        browserWindow.setResizable(true)
      } catch (error) {
        boundsLog.warn('Failed to enable resizable state for bounds update', { error })
      }
    }
    return () => {
      if (browserWindow.isDestroyed()) return
      if (!wasResizable) {
        try {
          browserWindow.setResizable(false)
        } catch (error) {
          boundsLog.warn('Failed to restore resizable state after bounds update', { error })
        }
      }
    }
  }

  public animate(
    browserWindow: Electron.BrowserWindow,
    target: Electron.Rectangle,
    options?: { minHeight?: number }
  ): void {
    if (browserWindow.isDestroyed()) return

    const isClose = (a: number, b: number, tolerance = 3): boolean => Math.abs(a - b) < tolerance
    const currentBounds = this.getCurrentBounds(browserWindow)

    if (this.currentAnimationTarget) {
      const targetDelta = Math.abs(this.currentAnimationTarget.height - target.height)
      if (
        isClose(this.currentAnimationTarget.x, target.x) &&
        isClose(this.currentAnimationTarget.y, target.y) &&
        isClose(this.currentAnimationTarget.width, target.width) &&
        targetDelta < this.options.animationRetargetTolerance
      ) {
        return
      }
    }

    if (
      !this.boundsAnimationTaskId &&
      isClose(currentBounds.x, target.x) &&
      isClose(currentBounds.y, target.y) &&
      isClose(currentBounds.width, target.width) &&
      isClose(currentBounds.height, target.height)
    ) {
      return
    }

    const createState = (
      startBounds: Electron.Rectangle,
      restoreResizable: () => void,
      token: number
    ): BoundsAnimationState => {
      const heightDelta = Math.abs(target.height - startBounds.height)
      return {
        browserWindow,
        startBounds,
        target: { ...target },
        startTime: performance.now(),
        durationMs: Math.min(220, Math.max(120, 120 + heightDelta * 0.16)),
        token,
        restoreResizable,
        minHeight: options?.minHeight
      }
    }

    this.currentAnimationTarget = { ...target }

    if (this.boundsAnimationState && this.boundsAnimationTaskId) {
      this.boundsAnimationState = createState(
        currentBounds,
        this.boundsAnimationState.restoreResizable,
        this.boundsAnimationState.token
      )
      return
    }

    const restoreResizable = this.prepareTemporaryResize(browserWindow)
    this.animationResizeRestore = restoreResizable
    const token = this.boundsAnimationToken
    this.boundsAnimationState = createState(currentBounds, restoreResizable, token)

    try {
      browserWindow.setMinimumSize(this.options.defaultWidth, this.options.minHeight)
    } catch (error) {
      boundsLog.warn('Failed to relax minimum size before bounds animation', { error })
    }

    const finishAnimation = (restore: boolean): void => {
      const state = this.boundsAnimationState
      this.pollingService.unregister(BOUNDS_ANIMATION_TASK_ID)
      if (this.boundsAnimationTaskId === BOUNDS_ANIMATION_TASK_ID) {
        this.boundsAnimationTaskId = null
      }
      this.boundsAnimationState = null
      if (restore && state && this.animationResizeRestore === state.restoreResizable) {
        this.animationResizeRestore = null
        state.restoreResizable()
      }
    }

    const lerp = (from: number, to: number, progress: number): number =>
      from + (to - from) * progress
    const easeOutCubic = (progress: number): number => 1 - (1 - progress) ** 3

    this.boundsAnimationTaskId = BOUNDS_ANIMATION_TASK_ID
    this.pollingService.register(
      BOUNDS_ANIMATION_TASK_ID,
      () => {
        const state = this.boundsAnimationState
        if (
          !state ||
          state.token !== this.boundsAnimationToken ||
          state.browserWindow.isDestroyed()
        ) {
          finishAnimation(true)
          this.currentAnimationTarget = null
          return
        }

        const elapsed = performance.now() - state.startTime
        const progress = Math.min(elapsed / state.durationMs, 1)
        const eased = easeOutCubic(progress)
        const nextBounds: Electron.Rectangle = {
          x: Math.round(lerp(state.startBounds.x, state.target.x, eased)),
          y: Math.round(lerp(state.startBounds.y, state.target.y, eased)),
          width: Math.round(lerp(state.startBounds.width, state.target.width, eased)),
          height: Math.round(lerp(state.startBounds.height, state.target.height, eased))
        }

        try {
          this.setBounds(state.browserWindow, nextBounds)
        } catch (error) {
          boundsLog.warn('Failed to animate window bounds', { error })
          finishAnimation(true)
          this.currentAnimationTarget = null
          return
        }

        if (progress >= 1) {
          finishAnimation(false)
          this.currentAnimationTarget = null
          try {
            this.setBounds(state.browserWindow, state.target)
            if (typeof state.minHeight === 'number') {
              state.browserWindow.setMinimumSize(this.options.defaultWidth, state.minHeight)
            }
          } catch (error) {
            boundsLog.warn('Failed to finalize window bounds animation', { error })
          } finally {
            if (this.animationResizeRestore === state.restoreResizable) {
              this.animationResizeRestore = null
              state.restoreResizable()
            }
          }
        }
      },
      { interval: 16, unit: 'milliseconds', lane: 'critical', backpressure: 'latest_wins' }
    )
    this.pollingService.start()
  }
}
