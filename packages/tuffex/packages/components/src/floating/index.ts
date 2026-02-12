import type { FloatingElementProps, FloatingProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxFloating from './src/TxFloating.vue'
import TxFloatingElement from './src/TxFloatingElement.vue'

const Floating = withInstall(TxFloating)
const FloatingElement = withInstall(TxFloatingElement)

export { Floating, FloatingElement, TxFloating, TxFloatingElement }
export type { FloatingElementProps, FloatingProps }
export type TxFloatingInstance = InstanceType<typeof TxFloating>
export type TxFloatingElementInstance = InstanceType<typeof TxFloatingElement>

export default Floating
