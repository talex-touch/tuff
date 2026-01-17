import type { FlexProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxFlex from './src/TxFlex.vue'

const Flex = withInstall(TxFlex)

export { Flex, TxFlex }
export type { FlexProps }
export type TxFlexInstance = InstanceType<typeof TxFlex>

export default Flex
