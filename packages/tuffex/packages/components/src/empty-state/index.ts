import type {
  EmptyStateAction,
  EmptyStateAlign,
  EmptyStateEmits,
  EmptyStateLayout,
  EmptyStateProps,
  EmptyStateSize,
  EmptyStateSurface,
  EmptyStateVariant,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxEmptyState.vue'

const TxEmptyState = withInstall(component)

export { TxEmptyState }
export type {
  EmptyStateAction,
  EmptyStateAlign,
  EmptyStateEmits,
  EmptyStateLayout,
  EmptyStateProps,
  EmptyStateSize,
  EmptyStateSurface,
  EmptyStateVariant,
}
export type TxEmptyStateInstance = InstanceType<typeof component>

export default TxEmptyState
