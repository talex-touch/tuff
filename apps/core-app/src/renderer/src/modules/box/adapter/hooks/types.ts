/**
 * Clipboard hook types
 *
 * Note: Uses IClipboardItem from main process clipboard module
 * to maintain consistency across renderer and main process.
 */

/**
 * Clipboard item interface (matches main process definition)
 */
export interface IClipboardItem {
  id?: number
  type: 'text' | 'image' | 'files'
  content: string
  thumbnail?: string | null
  rawContent?: string | null
  sourceApp?: string | null
  timestamp: string | Date
  isFavorite?: boolean | null
  metadata?: string | null
  meta?: Record<string, unknown> | null
}

/**
 * Clipboard state options
 */
export interface IClipboardOptions {
  /** Current clipboard content */
  last: IClipboardItem | null
  /** Timestamp when current clipboard was first detected (for expiration check) */
  detectedAt: number | null
}

/**
 * Clipboard hook return interface
 */
export interface IClipboardHook {
  /** Reactive clipboard state */
  clipboardOptions: IClipboardOptions
  /** Manually refresh clipboard from system */
  handlePaste: () => void
  /** Auto-paste logic (switch to FILE mode for files) */
  handleAutoPaste: () => void
  /** Apply clipboard item to active application */
  applyToActiveApp: (item?: IClipboardItem) => Promise<boolean>
  /** Clear clipboard state */
  clearClipboard: () => void
  /** Check if clipboard content is expired based on settings */
  isClipboardExpired: () => boolean
}

