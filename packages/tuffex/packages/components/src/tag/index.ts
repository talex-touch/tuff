import type { TagEmits, TagProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxTag from './src/TxTag.vue'

/**
 * TxTag component with Vue plugin installation support.
 *
 * @example
 * ```ts
 * import { TxTag } from '@talex-touch/tuffex'
 *
 * // Use in template
 * <TxTag label="Hello" color="var(--tx-color-success)" />
 * ```
 *
 * @public
 */
const Tag = withInstall(TxTag)

export { Tag, TxTag }
export type { TagEmits, TagProps }
export type TxTagInstance = InstanceType<typeof TxTag>

export default Tag
