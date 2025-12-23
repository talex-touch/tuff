import TxGroupBlock from './src/TxGroupBlock.vue'
import TxBlockLine from './src/TxBlockLine.vue'
import TxBlockSlot from './src/TxBlockSlot.vue'
import TxBlockSwitch from './src/TxBlockSwitch.vue'
import { withInstall } from '../../../utils/withInstall'
import type {
  GroupBlockProps,
  GroupBlockEmits,
  BlockLineProps,
  BlockLineEmits,
  BlockSlotProps,
  BlockSlotEmits,
  BlockSwitchProps,
  BlockSwitchEmits,
} from './src/types'

/**
 * TxGroupBlock component with Vue plugin installation support.
 *
 * @example
 * ```ts
 * import { TxGroupBlock, TxBlockLine, TxBlockSlot, TxBlockSwitch } from '@talex-touch/tuffex'
 * ```
 *
 * @public
 */
const GroupBlock = withInstall(TxGroupBlock)
const BlockLine = withInstall(TxBlockLine)
const BlockSlot = withInstall(TxBlockSlot)
const BlockSwitch = withInstall(TxBlockSwitch)

export {
  GroupBlock,
  BlockLine,
  BlockSlot,
  BlockSwitch,
  TxGroupBlock,
  TxBlockLine,
  TxBlockSlot,
  TxBlockSwitch,
}

export type {
  GroupBlockProps,
  GroupBlockEmits,
  BlockLineProps,
  BlockLineEmits,
  BlockSlotProps,
  BlockSlotEmits,
  BlockSwitchProps,
  BlockSwitchEmits,
}

export type TxGroupBlockInstance = InstanceType<typeof TxGroupBlock>
export type TxBlockLineInstance = InstanceType<typeof TxBlockLine>
export type TxBlockSlotInstance = InstanceType<typeof TxBlockSlot>
export type TxBlockSwitchInstance = InstanceType<typeof TxBlockSwitch>

export default GroupBlock
