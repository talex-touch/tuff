import type { CellLinkEmits, CellLinkProps, CellLinkUnderline } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxCellLink.vue'

const TxCellLink = withInstall(component)

export { TxCellLink }
export type { CellLinkEmits, CellLinkProps, CellLinkUnderline }
export type TxCellLinkInstance = InstanceType<typeof component>

export default TxCellLink
