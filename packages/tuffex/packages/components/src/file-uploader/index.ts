import type { FileUploaderEmits, FileUploaderFile, FileUploaderProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxFileUploader from './src/TxFileUploader.vue'

const FileUploader = withInstall(TxFileUploader)

export { FileUploader, TxFileUploader }
export type { FileUploaderEmits, FileUploaderFile, FileUploaderProps }
export type TxFileUploaderInstance = InstanceType<typeof TxFileUploader>

export default FileUploader
