import type {
  FilterChipItem,
  FilterChipsEmits,
  FilterChipsProps,
  FilterChipsRole,
  FilterChipValue,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxFilterChips.vue'

const TxFilterChips = withInstall(component)

export { TxFilterChips }
export type { FilterChipItem, FilterChipsEmits, FilterChipsProps, FilterChipsRole, FilterChipValue }
export type TxFilterChipsInstance = InstanceType<typeof component>

export default TxFilterChips
