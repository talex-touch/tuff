import type { TagInputEmits, TagInputProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxTagInput from './src/TxTagInput.vue'

const TagInput = withInstall(TxTagInput)

export { TagInput, TxTagInput }
export type { TagInputEmits, TagInputProps }
export type TxTagInputInstance = InstanceType<typeof TxTagInput>

export default TagInput
