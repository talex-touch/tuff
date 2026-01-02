import TxStack from './src/TxStack.vue'
import { withInstall } from '../../../utils/withInstall'
import type { StackProps } from './src/types'

const Stack = withInstall(TxStack)

export { Stack, TxStack }
export type { StackProps }
export type TxStackInstance = InstanceType<typeof TxStack>

export default Stack
