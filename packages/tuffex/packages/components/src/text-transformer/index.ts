import type { TextTransformerProps } from './src/types.ts'
import { withInstall } from '../../../utils/withInstall'
import TxTextTransformer from './src/TxTextTransformer.vue'

const TextTransformer = withInstall(TxTextTransformer)

export { TextTransformer, TxTextTransformer }
export type { TextTransformerProps }
export type TxTextTransformerInstance = InstanceType<typeof TxTextTransformer>

export default TextTransformer
