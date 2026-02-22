import type { TransferEmits, TransferItem, TransferProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxTransfer from './src/TxTransfer.vue'

const Transfer = withInstall(TxTransfer)

export { Transfer, TxTransfer }
export type { TransferEmits, TransferItem, TransferProps }
export type TxTransferInstance = InstanceType<typeof TxTransfer>

export default Transfer
