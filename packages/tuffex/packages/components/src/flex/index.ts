import TxFlex from './src/TxFlex.vue'
import { withInstall } from '../../../utils/withInstall'
import type { FlexProps } from './src/types'

const Flex = withInstall(TxFlex)

export { Flex, TxFlex }
export type { FlexProps }
export type TxFlexInstance = InstanceType<typeof TxFlex>

export default Flex
