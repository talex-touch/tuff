import type { InlineCitationEmits, InlineCitationProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxInlineCitation from './src/TxInlineCitation.vue'

const InlineCitation = withInstall(TxInlineCitation)

export { InlineCitation, TxInlineCitation }
export type { InlineCitationEmits, InlineCitationProps }
export type TxInlineCitationInstance = InstanceType<typeof TxInlineCitation>

export default InlineCitation
