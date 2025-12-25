import TxSearchSelect from './src/TxSearchSelect.vue'
import { withInstall } from '../../../utils/withInstall'
import type { TxSearchSelectEmits, TxSearchSelectOption, TxSearchSelectProps } from './src/types'

const SearchSelect = withInstall(TxSearchSelect)

export { SearchSelect, TxSearchSelect }
export type { TxSearchSelectProps, TxSearchSelectEmits, TxSearchSelectOption }
export type TxSearchSelectInstance = InstanceType<typeof TxSearchSelect>

export default SearchSelect
