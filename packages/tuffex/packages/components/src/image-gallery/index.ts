import TxImageGallery from './src/TxImageGallery.vue'
import { withInstall } from '../../../utils/withInstall'
import type { ImageGalleryEmits, ImageGalleryItem, ImageGalleryProps } from './src/types'

const ImageGallery = withInstall(TxImageGallery)

export { ImageGallery, TxImageGallery }
export type { ImageGalleryProps, ImageGalleryEmits, ImageGalleryItem }

export default ImageGallery
