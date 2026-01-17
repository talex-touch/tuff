import type { ImageUploaderEmits, ImageUploaderFile, ImageUploaderProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxImageUploader from './src/TxImageUploader.vue'

const ImageUploader = withInstall(TxImageUploader)

export { ImageUploader, TxImageUploader }
export type { ImageUploaderEmits, ImageUploaderFile, ImageUploaderProps }

export default ImageUploader
