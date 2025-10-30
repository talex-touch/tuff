/**
 * Clipboard hook types
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

export interface IClipboardOptions {
  /** Current clipboard content */
  last: IClipboardItem | null
  /** Timestamp when current clipboard was first detected */
  detectedAt: number | null
}

export interface IClipboardHook {
  /** Reactive clipboard options */
  clipboardOptions: IClipboardOptions
  /** Manually refresh clipboard content */
  handlePaste: () => void
  /** Auto-paste logic (switch to FILE mode for files) */
  handleAutoPaste: () => void
  /** Apply clipboard item to active application */
  applyToActiveApp: (item?: IClipboardItem) => Promise<boolean>
  /** Clear clipboard state */
  clearClipboard: () => void
  /** Check if clipboard content is expired */
  isClipboardExpired: () => boolean
}

