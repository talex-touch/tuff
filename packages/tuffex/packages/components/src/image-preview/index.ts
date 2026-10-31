import type {
  ImagePreviewAction,
  ImagePreviewActionEvent,
  ImagePreviewEmits,
  ImagePreviewIndicator,
  ImagePreviewItem,
  ImagePreviewOrigin,
  ImagePreviewOriginRect,
  ImagePreviewMinimapSlotProps,
  ImagePreviewProps,
  ImagePreviewSlotProps,
  ImagePreviewSource,
  ImagePreviewThumbnailSlotProps,
  ImagePreviewTransition,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxImagePreview from './src/TxImagePreview.vue'

/** Full-window picture viewer: grows out of its thumbnail; zoom, pan and turn by mouse, trackpad and touch, swipe to page, drag away to close. @public */
const ImagePreview = withInstall(TxImagePreview)

export { ImagePreview, TxImagePreview }
export type {
  ImagePreviewAction,
  ImagePreviewActionEvent,
  ImagePreviewEmits,
  ImagePreviewIndicator,
  ImagePreviewItem,
  ImagePreviewOrigin,
  ImagePreviewMinimapSlotProps,
  ImagePreviewProps,
  ImagePreviewSlotProps,
  ImagePreviewSource,
  ImagePreviewThumbnailSlotProps,
  ImagePreviewTransition,
}
export type TxImagePreviewInstance = InstanceType<typeof TxImagePreview>

export default ImagePreview
