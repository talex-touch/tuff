import type { TxSearchSelectEmits, TxSearchSelectOption, TxSearchSelectProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxSearchSelect from './src/TxSearchSelect.vue'

const SearchSelect = withInstall(TxSearchSelect)

export { SearchSelect, TxSearchSelect }
export type { TxSearchSelectEmits, TxSearchSelectOption, TxSearchSelectProps }
export type TxSearchSelectInstance = InstanceType<typeof TxSearchSelect>

export default SearchSelect
