import { withInstall } from '../../../utils/withInstall'
import TxReasoningDisclosure from './src/TxReasoningDisclosure.vue'

const ReasoningDisclosure = withInstall(TxReasoningDisclosure)

export { ReasoningDisclosure, TxReasoningDisclosure }
export type TxReasoningDisclosureInstance = InstanceType<typeof TxReasoningDisclosure>

export default ReasoningDisclosure
