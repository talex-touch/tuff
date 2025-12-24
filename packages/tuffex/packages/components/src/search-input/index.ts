import TxSearchInput from './src/TxSearchInput.vue'
import { withInstall } from '../../../utils/withInstall'
import type { SearchInputEmits, SearchInputProps } from './src/types'

const SearchInput = withInstall(TxSearchInput)

export { SearchInput, TxSearchInput }
export type { SearchInputProps, SearchInputEmits }
export type TxSearchInputInstance = InstanceType<typeof TxSearchInput>

export default SearchInput
