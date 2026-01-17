import type { SearchInputEmits, SearchInputProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxSearchInput from './src/TxSearchInput.vue'

const SearchInput = withInstall(TxSearchInput)

export { SearchInput, TxSearchInput }
export type { SearchInputEmits, SearchInputProps }
export type TxSearchInputInstance = InstanceType<typeof TxSearchInput>

export default SearchInput
