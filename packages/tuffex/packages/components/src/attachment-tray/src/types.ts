import type { AiAttachment, AiAttachmentFile } from '../../ai-elements/src/types'
import type { ImagePreviewActionEvent, ImagePreviewProps } from '../../image-preview/src/types'

/**
 * The preview's options the tray leaves to its host: the actions and their menu, the strip along
 * the bottom, the motion and the materials. The tray sets the pictures, the ones that failed,
 * where each one flies from, and the labels it has props of its own for.
 */
export type AttachmentTrayPreviewProps = Omit<
  ImagePreviewProps,
  'images' | 'failed' | 'origin' | 'label' | 'previousLabel' | 'nextLabel' | 'closeLabel' | 'zoomInLabel' | 'zoomOutLabel' | 'resetLabel' | 'failedText'
>

export interface AttachmentTrayProps {
  attachments: AiAttachment[]
  /** Composer mode shows remove/cancel affordances; message mode is read-only. */
  removable?: boolean
  /**
   * The preview's accessible name, followed by the image's `name`; also starts each thumbnail's
   * accessible name unless `openLabelFormatter` builds it. @default 'Preview'
   */
  previewTitle?: string
  /** Accessible label for the previous-image button. @default 'Previous image' */
  previousLabel?: string
  /** Accessible label for the next-image button. @default 'Next image' */
  nextLabel?: string
  /** @deprecated Not shown: the preview's page buttons are icons, named by `previousLabel` and `nextLabel`. */
  previousText?: string
  /** @deprecated Not shown: the preview's page buttons are icons, named by `previousLabel` and `nextLabel`. */
  nextText?: string
  /** Accessible label for the preview's close button. @default 'Close' */
  closeLabel?: string
  /** Accessible label for the preview's zoom-in button. @default 'Zoom in' */
  zoomInLabel?: string
  /** Accessible label for the preview's zoom-out button. @default 'Zoom out' */
  zoomOutLabel?: string
  /** The first item of the menu the preview's zoom readout opens, which shows the whole image again. @default 'Fit to screen' */
  resetLabel?: string
  /** Shown in the preview in place of an image that failed to load. @default 'This image could not be loaded' */
  failedText?: string
  /** Accessible label for remove buttons. @default 'Remove attachment' */
  removeLabel?: string
  /** Accessible label for cancel-upload buttons. @default 'Cancel upload' */
  cancelLabel?: string
  /** Formats file sizes for chips. @default B/KB/MB with one decimal */
  sizeFormatter?: (bytes: number) => string
  /** Builds a thumbnail's aria-label from the image's `name`, or its `id` without one. @default (name) => `${previewTitle}: ${name}` */
  openLabelFormatter?: (name: string) => string
  /** The preview's other options, passed on as they are. */
  previewProps?: AttachmentTrayPreviewProps
}

export interface AttachmentTrayEmits {
  (e: 'remove', id: string): void
  (e: 'cancel', id: string): void
  /** File chips only — what "open" means is the consumer's call. */
  (e: 'open', attachment: AiAttachmentFile): void
  /** An action was chosen in the preview, before it runs; `preventDefault()` runs it yourself. */
  (e: 'action', payload: ImagePreviewActionEvent): void
}

export interface AttachmentChipProps {
  attachment: AiAttachment & { kind: 'file' }
  removable?: boolean
  removeLabel?: string
  cancelLabel?: string
  sizeFormatter?: (bytes: number) => string
}
