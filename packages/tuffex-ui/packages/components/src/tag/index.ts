import TxTag from './src/TxTag.vue'
import { withInstall } from '../../../utils/withInstall'
import type { TagProps, TagEmits } from './src/types'

/**
 * TxTag component with Vue plugin installation support.
 *
 * @example
 * ```ts
 * import { TxTag } from '@talex-touch/tuff-ui'
 *
 * // Use in template
 * <TxTag label="Hello" color="var(--tx-color-success)" />
 * ```
 *
 * @public
 */
const Tag = withInstall(TxTag)

export { Tag, TxTag }
export type { TagProps, TagEmits }
export type TxTagInstance = InstanceType<typeof TxTag>

export default Tag
