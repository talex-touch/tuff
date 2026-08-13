import type { AiAttachment, AiAttachmentFile } from '../../ai-elements/src/types'

export interface AttachmentTrayProps {
  attachments: AiAttachment[]
  /** Composer mode shows remove/cancel affordances; message mode is read-only. */
  removable?: boolean
  /** Fallback modal title when the previewed image has no `name`. @default 'Preview' */
  previewTitle?: string
  /** Accessible label for the previous-image button. @default 'Previous image' */
  previousLabel?: string
  /** Accessible label for the next-image button. @default 'Next image' */
  nextLabel?: string
  /** Visible text of the previous-image button. @default 'Prev' */
  previousText?: string
  /** Visible text of the next-image button. @default 'Next' */
  nextText?: string
  /** Accessible label for remove buttons. @default 'Remove attachment' */
  removeLabel?: string
  /** Accessible label for cancel-upload buttons. @default 'Cancel upload' */
  cancelLabel?: string
  /** Formats file sizes for chips. @default B/KB/MB with one decimal */
  sizeFormatter?: (bytes: number) => string
}

export interface AttachmentTrayEmits {
  (e: 'remove', id: string): void
  (e: 'cancel', id: string): void
  /** File chips only — what "open" means is the consumer's call. */
  (e: 'open', attachment: AiAttachmentFile): void
}

export interface AttachmentChipProps {
  attachment: AiAttachment & { kind: 'file' }
  removable?: boolean
  removeLabel?: string
  cancelLabel?: string
  sizeFormatter?: (bytes: number) => string
}
