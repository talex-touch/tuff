import gsap from 'gsap'
import { TalexTouch } from '../types'

/**
 * Window animation controller return type
 */
export interface WindowAnimationController {
  /**
   * Update window height with animation
   * @param newHeight - The new height to animate to
   * @param duration - Animation duration in seconds (default: 0.5)
   * @returns Promise that resolves to true if animation completed successfully, false if interrupted
   */
  updateHeight: (newHeight: number, duration?: number) => Promise<boolean>

  /**
   * Cancel current animation
   * @returns Promise that resolves to true if there was an animation to cancel, false otherwise
   */
  cancel: () => Promise<boolean>

  /**
   * Toggle window visibility
   * @param visible - Optional parameter to explicitly set visibility state
   * @returns Promise that resolves to true if operation completed successfully, false otherwise
   */
  toggleWindow: (visible?: boolean) => Promise<boolean>

  /**
   * Change current window instance
   * @param newWindow - New TouchWindow instance
   */
  changeWindow: (newWindow: TalexTouch.ITouchWindow) => void
}

/**
 * Tracks the state of an animation
 */
interface AnimationState {
  tween: gsap.core.Tween | null
  completed: boolean
}

/**
 * Use GSAP to animate window with cubic-bezier easing
 * @param window - TouchWindow instance (optional, can be set later with changeWindow)
 * @returns WindowAnimationController with updateHeight, cancel, toggleWindow, and changeWindow methods
 */
export function useWindowAnimation(window?: TalexTouch.ITouchWindow): WindowAnimationController {
  // Store current window reference inside the function scope
  let currentWindow: TalexTouch.ITouchWindow | null = window || null

  const animationState: AnimationState = {
    tween: null,
    completed: false
  }

  /**
   * Check if current window is valid
   * @returns true if window is valid, false otherwise
   */
  const isWindowValid = (): boolean => {
    return (
      currentWindow !== null &&
      currentWindow.window !== null &&
      !currentWindow.window.isDestroyed()
    )
  }

  /**
   * Get current window with validation
   * @returns current window or throws error if invalid
   */
  const getCurrentWindow = (): TalexTouch.ITouchWindow => {
    if (!isWindowValid()) {
      throw new Error('Window is not valid or has been destroyed')
    }
    return currentWindow!
  }

  const updateHeight = async (newHeight: number, duration: number = 0.5): Promise<boolean> => {
    try {
      const window = getCurrentWindow()

      // Cancel any existing animation
      if (animationState.tween) {
        animationState.tween.kill()
      }

      // Reset state for new animation
      animationState.completed = false

      const browserWindow = window.window
      const [currentWidth, currentHeight] = browserWindow.getSize()
      const [x, y] = browserWindow.getPosition()

      return new Promise<boolean>((resolve) => {
        animationState.tween = gsap.to(
          {
            height: currentHeight
          },
          {
            height: newHeight,
            duration,
            ease: 'cubic-bezier(0.785, 0.135, 0.15, 0.86)',
            onUpdate: function () {
              // Check if animation was cancelled or window destroyed
              if (!animationState.tween || !isWindowValid()) {
                resolve(false)
                return
              }

              const animatedHeight = Math.round(this.targets()[0].height)
              browserWindow.setSize(currentWidth, animatedHeight)
              browserWindow.setPosition(x, y)
            },
            onComplete: () => {
              animationState.tween = null
              animationState.completed = true
              resolve(true)
            },
            onKill: () => {
              animationState.tween = null
              resolve(false)
            }
          }
        )
      })
    } catch (error) {
      console.error('Error in updateHeight:', error)
      return Promise.resolve(false)
    }
  }

  const cancel = async (): Promise<boolean> => {
    if (animationState.tween) {
      animationState.tween.kill()
      animationState.tween = null
      return Promise.resolve(true)
    }
    return Promise.resolve(false)
  }

  const toggleWindow = async (visible?: boolean): Promise<boolean> => {
    try {
      const window = getCurrentWindow()
      const browserWindow = window.window

      // Determine target visibility state
      const targetVisible = visible !== undefined ? visible : !browserWindow.isVisible()

      if (targetVisible) {
        // Show window
        browserWindow.show()
      } else {
        // Hide window
        if (process.platform === 'darwin') {
          // On macOS, we can simply hide the window
          browserWindow.hide()
        } else {
          // On other platforms, move window far off-screen before hiding
          browserWindow.setPosition(-100000, -100000)
          browserWindow.hide()
        }
      }

      return Promise.resolve(true)
    } catch (error) {
      console.error('Error in toggleWindow:', error)
      return Promise.resolve(false)
    }
  }

  const changeWindow = (newWindow: TalexTouch.ITouchWindow): void => {
    // Cancel any ongoing animation
    if (animationState.tween) {
      animationState.tween.kill()
      animationState.tween = null
    }

    // Set new window
    currentWindow = newWindow
  }

  return {
    updateHeight,
    cancel,
    toggleWindow,
    changeWindow
  }
}