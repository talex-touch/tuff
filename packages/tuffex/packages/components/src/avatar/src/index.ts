export { default as TxAvatar } from './TxAvatar.vue'
export { default as TxAvatarGroup } from './TxAvatarGroup.vue'
export { default as TxAvatarEditor } from './editor/TxAvatarEditor.vue'
export { avatarMediaEngine } from './editor/engine'
export type { DecodedGif, GifEncodeOptions, GifFrame } from './editor/gif-codec'
export type { ExtractedIcoEntry, IcoDirectoryEntry, IcoPngEntry } from './editor/ico-codec'
export type { ExportAvatarMediaOptions } from './editor/media-codecs'
export type { LoadedAvatarMedia, LoadedGifFrame } from './editor/media-loader'
export type { ParsedSvgSource } from './editor/svg-codec'
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
  AvatarFormatMeta,
  AvatarGifClipOptions,
  AvatarOutputFormat,
  AvatarSourceKind,
} from './editor/types'
export type {
  AvatarEmits,
  AvatarGroupHoverEffect,
  AvatarGroupOverflowSlotProps,
  AvatarGroupProps,
  AvatarPresetSize,
  AvatarProps,
  AvatarShape,
  AvatarSize,
  AvatarStatus,
} from './types'
