/**
 * Box SDK for Plugin Development
 *
 * Provides a unified API for plugins to control the CoreBox window behavior,
 * including visibility, size, input field control, and input value access.
 */

/**
 * Clipboard content type flags for binary combination
 */
export enum ClipboardType {
  TEXT = 0b0001,
  IMAGE = 0b0010,
  FILE = 0b0100,
}

/**
 * Preset clipboard type combinations
 */
export const ClipboardTypePresets = {
  TEXT_ONLY: ClipboardType.TEXT,
  TEXT_AND_IMAGE: ClipboardType.TEXT | ClipboardType.IMAGE,
  ALL: ClipboardType.TEXT | ClipboardType.IMAGE | ClipboardType.FILE,
} as const

/**
 * Expand options for CoreBox window
 */
export interface BoxExpandOptions {
  /** Number of items to show (affects window height) */
  length?: number
  /** Force maximum expansion */
  forceMax?: boolean
}

/**
 * Box SDK interface for plugins
 *
 * @example
 * ```typescript
 * // Hide CoreBox
 * plugin.box.hide()
 *
 * // Show CoreBox
 * plugin.box.show()
 *
 * // Expand to show 10 items
 * plugin.box.expand({ length: 10 })
 *
 * // Get current input
 * const input = plugin.box.getInput()
 * ```
 */
export interface BoxSDK {
  /**
   * Hides the CoreBox window
   *
   * @example
   * ```typescript
   * plugin.box.hide()
   * ```
   */
  hide: () => void

  /**
   * Shows the CoreBox window
   *
   * @example
   * ```typescript
   * plugin.box.show()
   * ```
   */
  show: () => void

  /**
   * Expands the CoreBox window
   *
   * @param options - Optional expansion configuration
   *
   * @example
   * ```typescript
   * // Expand to show 10 items
   * plugin.box.expand({ length: 10 })
   *
   * // Force maximum expansion
   * plugin.box.expand({ forceMax: true })
   *
   * // Default expansion
   * plugin.box.expand()
   * ```
   */
  expand: (options?: BoxExpandOptions) => Promise<void>

  /**
   * Shrinks the CoreBox window to compact size
   *
   * @example
   * ```typescript
   * plugin.box.shrink()
   * ```
   */
  shrink: () => Promise<void>

  /**
   * Hides the input field in CoreBox
   *
   * @example
   * ```typescript
   * plugin.box.hideInput()
   * ```
   */
  hideInput: () => Promise<void>

  /**
   * Shows the input field in CoreBox
   *
   * @example
   * ```typescript
   * plugin.box.showInput()
   * ```
   */
  showInput: () => Promise<void>

  /**
   * Gets the current input value from CoreBox search field
   *
   * @returns Promise resolving to the current input string
   *
   * @example
   * ```typescript
   * const input = await plugin.box.getInput()
   * console.log('Current input:', input)
   * ```
   */
  getInput: () => Promise<string>

  /**
   * Enable input monitoring for attached UI view
   *
   * @example
   * ```typescript
   * await plugin.box.allowInput()
   * plugin.channel.regChannel('core-box:input-change', ({ data }) => {
   *   console.log('Input changed:', data.input)
   * })
   * ```
   */
  allowInput: () => Promise<void>

  /**
   * Enable clipboard monitoring for specified type combination
   *
   * @param types - Binary combination of ClipboardType flags
   *
   * @example
   * ```typescript
   * // Allow text and images
   * await plugin.box.allowClipboard(ClipboardType.TEXT | ClipboardType.IMAGE)
   *
   * // Or use presets
   * await plugin.box.allowClipboard(ClipboardTypePresets.TEXT_AND_IMAGE)
   * ```
   */
  allowClipboard: (types: number) => Promise<void>
}

/**
 * Creates a Box SDK instance for plugin use
 *
 * @param channel - The plugin channel bridge for IPC communication
 * @returns Configured Box SDK instance
 *
 * @internal
 */
export function createBoxSDK(channel: any): BoxSDK {
  const sendFn = channel.sendToMain || channel.send

  if (!sendFn) {
    throw new Error('[Box SDK] Channel send function not available')
  }

  return {
    hide(): void {
      sendFn('core-box:hide').catch((error: any) => {
        console.error('[Box SDK] Failed to hide CoreBox:', error)
      })
    },

    show(): void {
      sendFn('core-box:show').catch((error: any) => {
        console.error('[Box SDK] Failed to show CoreBox:', error)
      })
    },

    async expand(options?: BoxExpandOptions): Promise<void> {
      try {
        await sendFn('core-box:expand', options || {})
      }
      catch (error) {
        console.error('[Box SDK] Failed to expand CoreBox:', error)
        throw error
      }
    },

    async shrink(): Promise<void> {
      try {
        await sendFn('core-box:expand', { mode: 'collapse' })
      }
      catch (error) {
        console.error('[Box SDK] Failed to shrink CoreBox:', error)
        throw error
      }
    },

    async hideInput(): Promise<void> {
      try {
        await sendFn('core-box:hide-input')
      }
      catch (error) {
        console.error('[Box SDK] Failed to hide input:', error)
        throw error
      }
    },

    async showInput(): Promise<void> {
      try {
        await sendFn('core-box:show-input')
      }
      catch (error) {
        console.error('[Box SDK] Failed to show input:', error)
        throw error
      }
    },

    async getInput(): Promise<string> {
      try {
        const result = await sendFn('core-box:get-input')
        return result?.data?.input || result?.input || ''
      }
      catch (error) {
        console.error('[Box SDK] Failed to get input:', error)
        throw error
      }
    },

    async allowInput(): Promise<void> {
      try {
        await sendFn('core-box:allow-input')
      }
      catch (error) {
        console.error('[Box SDK] Failed to enable input monitoring:', error)
        throw error
      }
    },

    async allowClipboard(types: number): Promise<void> {
      try {
        await sendFn('core-box:allow-clipboard', types)
      }
      catch (error) {
        console.error('[Box SDK] Failed to enable clipboard monitoring:', error)
        throw error
      }
    },
  }
}

/**
 * Hook for using Box SDK in plugin context
 *
 * @returns Box SDK instance
 *
 * @example
 * ```typescript
 * const box = useBox()
 *
 * box.hide()
 * box.expand({ length: 10 })
 * const input = await box.getInput()
 * ```
 */
export function useBox(): BoxSDK {
  const channel = window.$channel

  if (!channel) {
    throw new Error('[Box SDK] Channel not available. Make sure this is called in a plugin context.')
  }

  return createBoxSDK(channel)
}
