/**
 * Clipboard hook types
 *
 * Note: Mirrors main process clipboard item shape, with renderer-only
 * html type to support rich text preview flows.
 */

/**
 * Clipboard item interface (matches main process definition)
 */
import type { Ref } from 'vue'

export interface IClipboardItem {
  id?: number
  type: 'text' | 'image' | 'files' | 'html'
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
  /** Timestamp when current clipboard was first detected */
  detectedAt: number | null
  /** Timestamp of the last clipboard item that was cleared (to prevent re-paste of same content) */
  lastClearedTimestamp: string | Date | null
}

/**
 * Clipboard hook return interface
 */
export interface IClipboardHook {
  clipboardOptions: IClipboardOptions
  handlePaste: (options?: { overrideDismissed?: boolean; triggerSearch?: boolean }) => void
  handleAutoFill: () => void
  applyToActiveApp: (item?: IClipboardItem) => Promise<boolean>
  clearClipboard: (options?: { remember?: boolean }) => void
  /** Resets autopaste state for new CoreBox session */
  resetAutoPasteState: () => void
  autoPasteActive: Ref<boolean>
}
