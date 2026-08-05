import type { AttachmentChipProps, AttachmentTrayEmits, AttachmentTrayProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxAttachmentChip from './src/TxAttachmentChip.vue'
import TxAttachmentTray from './src/TxAttachmentTray.vue'

const AttachmentTray = withInstall(TxAttachmentTray)
const AttachmentChip = withInstall(TxAttachmentChip)

export { AttachmentChip, AttachmentTray, TxAttachmentChip, TxAttachmentTray }
export { formatSize } from './src/format-size'
export type { AttachmentChipProps, AttachmentTrayEmits, AttachmentTrayProps }
export type TxAttachmentTrayInstance = InstanceType<typeof TxAttachmentTray>

export default AttachmentTray
