import type {
  AvatarCaptureMode,
  AvatarEditorConfig,
  AvatarEditorConverterContext,
  AvatarEditorCustomConverter,
  AvatarEditorEmits,
  AvatarEditorLabels,
  AvatarEditorProps,
  AvatarEditorTransform,
  AvatarEditResult,
  AvatarEditTrigger,
  AvatarFormatMeta,
  AvatarGifClipOptions,
  AvatarOutputFormat,
  AvatarSourceKind,
} from './src/editor/types'
import type {
  AvatarEmits,
  AvatarGroupHoverEffect,
  AvatarGroupOverflowSlotProps,
  AvatarGroupProps,
  AvatarPresetSize,
  AvatarProps,
  AvatarShape,
  AvatarSize,
  AvatarStatus,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxAvatarEditorComponent from './src/editor/TxAvatarEditor.vue'
import TxAvatarComponent from './src/TxAvatar.vue'
import TxAvatarGroupComponent from './src/TxAvatarGroup.vue'

const TxAvatar = withInstall(TxAvatarComponent)
const TxAvatarGroup = withInstall(TxAvatarGroupComponent)
const TxAvatarEditor = withInstall(TxAvatarEditorComponent)

export { TxAvatar, TxAvatarEditor, TxAvatarGroup }
export { avatarMediaEngine } from './src/editor/engine'
export type { DecodedGif, GifEncodeOptions, GifFrame } from './src/editor/gif-codec'
export type { ExtractedIcoEntry, IcoDirectoryEntry, IcoPngEntry } from './src/editor/ico-codec'
export type { ExportAvatarMediaOptions } from './src/editor/media-codecs'
export type { LoadedAvatarMedia, LoadedGifFrame } from './src/editor/media-loader'
export type { ParsedSvgSource } from './src/editor/svg-codec'
export type {
  AvatarCaptureMode,
  AvatarEditorConfig,
  AvatarEditorConverterContext,
  AvatarEditorCustomConverter,
  AvatarEditorEmits,
  AvatarEditorLabels,
  AvatarEditorProps,
  AvatarEditorTransform,
  AvatarEditResult,
  AvatarEditTrigger,
  AvatarEmits,
  AvatarFormatMeta,
  AvatarGifClipOptions,
  AvatarGroupHoverEffect,
  AvatarGroupOverflowSlotProps,
  AvatarGroupProps,
  AvatarOutputFormat,
  AvatarPresetSize,
  AvatarProps,
  AvatarShape,
  AvatarSize,
  AvatarSourceKind,
  AvatarStatus,
}
export type TxAvatarInstance = InstanceType<typeof TxAvatarComponent>
export type TxAvatarGroupInstance = InstanceType<typeof TxAvatarGroupComponent>
export type TxAvatarEditorInstance = InstanceType<typeof TxAvatarEditorComponent>

export default TxAvatar
