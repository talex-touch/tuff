import type { VNode } from 'vue'
import type { PopoverPlacement } from '../../popover'
import type {
  AvatarEditorConfig,
  AvatarEditorLabels,
  AvatarEditResult,
  AvatarEditTrigger,
  AvatarOutputFormat,
} from './editor/types'

export type AvatarPresetSize = 'small' | 'medium' | 'large' | 'xlarge'
export type AvatarSize = AvatarPresetSize | number | `${number}` | `${number}px`

export type AvatarStatus = 'online' | 'offline' | 'busy' | 'away'

export type AvatarShape = 'circle' | 'square' | 'rounded'

export type AvatarGroupHoverEffect = 'none' | 'lift'

export interface AvatarProps {
  src?: string
  alt?: string
  name?: string
  icon?: string
  size?: AvatarSize
  status?: AvatarStatus
  shape?: AvatarShape
  clickable?: boolean
  /** Enables interactive upload, crop, rotate, frame capture and format conversion. */
  editable?: boolean
  /** Disables editing interaction when `editable` is enabled. */
  disabled?: boolean
  /** `'editor'` opens the modal directly; `'upload'` opens the file picker first and launches the editor once a file is selected. @default 'editor' */
  editTrigger?: AvatarEditTrigger
  /** Accessible label for the edit affordance. @default 'Edit avatar' */
  editLabel?: string
  /** Accepted file types passed to the uploader and file picker. */
  accept?: string
  /** Default output format in the editor. @default 'png' */
  outputFormat?: AvatarOutputFormat
  /** Restrict selectable output formats in the editor. */
  allowedOutputFormats?: AvatarOutputFormat[]
  /** Allow switching output formats client-side. @default true */
  allowFormatConversion?: boolean
  /** Default output pixel width/height. @default 512 */
  outputSize?: number
  /** Default lossy encoding quality (`0.1` to `1`). @default 0.92 */
  outputQuality?: number
  /** Allow MP4/WebM/MOV video frame & clip extraction. @default true */
  allowVideoCapture?: boolean
  /** Allow animated GIF clip export from GIF and video sources. @default true */
  allowGifAnimation?: boolean
  /** Localization overrides for the built-in editor UI. */
  editorLabels?: Partial<AvatarEditorLabels>
  /** Additional configuration forwarded to `TxAvatarEditor`. */
  editorProps?: Partial<AvatarEditorConfig>
  backgroundColor?: string
  textColor?: string
}

export interface AvatarEmits {
  'click': []
  'update:src': [src: string]
  'edit': [result: AvatarEditResult]
  'edit-open': []
  'edit-cancel': []
  'edit-error': [error: Error]
}

export interface AvatarGroupProps {
  max?: number
  size?: AvatarSize
  overlap?: number | string

  /** Per-avatar hover feedback: `lift` raises the hovered avatar above its neighbours. */
  hoverEffect?: AvatarGroupHoverEffect
  /** Fan the whole row apart while the group is hovered. */
  spreadOnHover?: boolean
  /** Overlap to ease towards while spread; only read when `spreadOnHover` is set. */
  spreadOverlap?: number | string

  /** Reveal the avatars behind `+N` in a popover. Off by default: it adds a floating layer. */
  overflowPopover?: boolean
  overflowPopoverTrigger?: 'hover' | 'click'
  overflowPopoverPlacement?: PopoverPlacement
}

export interface AvatarGroupOverflowSlotProps {
  /** The avatars `max` cut off, ready to render. */
  nodes: VNode[]
  count: number
}
