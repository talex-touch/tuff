import TxImageUploader from './src/TxImageUploader.vue'
import { withInstall } from '../../../utils/withInstall'
import type { ImageUploaderEmits, ImageUploaderFile, ImageUploaderProps } from './src/types'

const ImageUploader = withInstall(TxImageUploader)

export { ImageUploader, TxImageUploader }
export type { ImageUploaderProps, ImageUploaderEmits, ImageUploaderFile }

export default ImageUploader
