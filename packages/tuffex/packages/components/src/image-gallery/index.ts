import type { ImageGalleryEmits, ImageGalleryItem, ImageGalleryProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxImageGallery from './src/TxImageGallery.vue'

const ImageGallery = withInstall(TxImageGallery)

export { ImageGallery, TxImageGallery }
export type { ImageGalleryEmits, ImageGalleryItem, ImageGalleryProps }

export default ImageGallery
