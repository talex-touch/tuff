import type {
  DescriptionsItemProps,
  DescriptionsLayout,
  DescriptionsProps,
  DescriptionsSize,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxDescriptions from './src/TxDescriptions.vue'
import TxDescriptionsItem from './src/TxDescriptionsItem.vue'

/**
 * TxDescriptions — a read-only list of label/value pairs, rendered as a semantic
 * `<dl>`: a record's fields in a drawer, a detail panel or a summary card. Items lay
 * out in `columns`, fall back to one column below 480px of container, and show
 * `emptyText` for a value that renders nothing.
 *
 * @example
 * ```ts
 * import { TxDescriptions, TxDescriptionsItem } from '@talex-touch/tuffex/descriptions'
 *
 * // <TxDescriptions :columns="2">
 * //   <TxDescriptionsItem label="Email">{{ user.email }}</TxDescriptionsItem>
 * //   <TxDescriptionsItem label="Phone">{{ user.phone }}</TxDescriptionsItem>
 * // </TxDescriptions>
 * ```
 *
 * @public
 */
const Descriptions = withInstall(TxDescriptions)
const DescriptionsItem = withInstall(TxDescriptionsItem)

export { Descriptions, DescriptionsItem, TxDescriptions, TxDescriptionsItem }
export type { DescriptionsItemProps, DescriptionsLayout, DescriptionsProps, DescriptionsSize }
export type TxDescriptionsInstance = InstanceType<typeof TxDescriptions>
export type TxDescriptionsItemInstance = InstanceType<typeof TxDescriptionsItem>

export default Descriptions
