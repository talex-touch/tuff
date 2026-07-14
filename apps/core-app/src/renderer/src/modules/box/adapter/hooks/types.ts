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
import type { ClipboardCaptureSource } from '@talex-touch/utils/transport/events/types'

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
  captureSource?: ClipboardCaptureSource
  observedAt?: number
  freshnessBaseAt?: number
  autoPasteEligible?: boolean
}

/**
 * Clipboard state options
 */
export interface IClipboardOptions {
  /** Current clipboard content */
  last: IClipboardItem | null
  /** Hidden clipboard snapshot preserved after short-text auto-fill */
  pendingAutoFillItem: IClipboardItem | null
  /** Timestamp when current clipboard was first detected */
  detectedAt: number | null
  /** Timestamp of the last clipboard item that was cleared (to prevent re-paste of same content) */
  lastClearedTimestamp: string | Date | null
  /** Whether current clipboard state was activated implicitly or by an explicit paste */
  activeClipboardSource?: 'manual' | 'auto' | null
  /** Fingerprint for the most recent text/html clipboard item shown as an attachment */
  lastTextAttachmentIdentity?: string | null
  /** Source that recorded the most recent text/html attachment fingerprint */
  lastTextAttachmentSource?: 'manual' | 'auto' | null
}

/**
 * Clipboard hook return interface
 */
export interface IClipboardHook {
  clipboardOptions: IClipboardOptions
  handlePaste: (options?: {
    overrideDismissed?: boolean
    triggerSearch?: boolean
    attemptAutoFill?: boolean
  }) => void
  applyToActiveApp: (item?: IClipboardItem) => Promise<boolean>
  clearClipboard: (options?: { remember?: boolean }) => void
  /** Resets autopaste state for new CoreBox session */
  resetAutoPasteState: () => void
  autoPasteActive: Ref<boolean>
}
