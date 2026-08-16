import type {
  ApprovalAnswer,
  ApprovalAnswerMap,
  ApprovalCardEmits,
  ApprovalCardProps,
  ApprovalOption,
  ApprovalQuestion,
  ApprovalQuestionType,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxApprovalCard from './src/TxApprovalCard.vue'

/**
 * TxApprovalCard — the clarifying questions an agent asks before it acts.
 *
 * This is a questionnaire, not a gate: use `TxToolConfirmation` for the binary
 * allow/deny decision on a single tool call.
 *
 * Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
 *
 * @example
 * ```ts
 * import { TxApprovalCard } from '@talex-touch/tuffex'
 *
 * // Use in template
 * <TxApprovalCard v-model="answers" :questions="questions" @submit="run" />
 * ```
 *
 * @public
 */
const ApprovalCard = withInstall(TxApprovalCard)

export { ApprovalCard, TxApprovalCard }
export type {
  ApprovalAnswer,
  ApprovalAnswerMap,
  ApprovalCardEmits,
  ApprovalCardProps,
  ApprovalOption,
  ApprovalQuestion,
  ApprovalQuestionType,
}
export type TxApprovalCardInstance = InstanceType<typeof TxApprovalCard>

export default ApprovalCard
