import type { StackProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxStack from './src/TxStack.vue'

const Stack = withInstall(TxStack)

export { Stack, TxStack }
export type { StackProps }
export type TxStackInstance = InstanceType<typeof TxStack>

export default Stack
