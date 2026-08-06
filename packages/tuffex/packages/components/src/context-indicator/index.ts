import { withInstall } from '../../../utils/withInstall'
import TxContextIndicator from './src/TxContextIndicator.vue'

const ContextIndicator = withInstall(TxContextIndicator)

export { ContextIndicator, TxContextIndicator }
export type TxContextIndicatorInstance = InstanceType<typeof TxContextIndicator>

export default ContextIndicator
