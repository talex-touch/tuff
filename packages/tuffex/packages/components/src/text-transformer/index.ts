import TxTextTransformer from './src/TxTextTransformer.vue'
import { withInstall } from '../../../utils/withInstall'
import type { TextTransformerProps } from './src/types.ts'

const TextTransformer = withInstall(TxTextTransformer)

export { TextTransformer, TxTextTransformer }
export type { TextTransformerProps }
export type TxTextTransformerInstance = InstanceType<typeof TxTextTransformer>

export default TextTransformer
