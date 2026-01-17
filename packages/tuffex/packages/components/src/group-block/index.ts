import type {
  BlockLineEmits,
  BlockLineProps,
  BlockSlotEmits,
  BlockSlotProps,
  BlockSwitchEmits,
  BlockSwitchProps,
  GroupBlockEmits,
  GroupBlockProps,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxBlockLine from './src/TxBlockLine.vue'
import TxBlockSlot from './src/TxBlockSlot.vue'
import TxBlockSwitch from './src/TxBlockSwitch.vue'
import TxGroupBlock from './src/TxGroupBlock.vue'

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
  BlockLine,
  BlockSlot,
  BlockSwitch,
  GroupBlock,
  TxBlockLine,
  TxBlockSlot,
  TxBlockSwitch,
  TxGroupBlock,
}

export type {
  BlockLineEmits,
  BlockLineProps,
  BlockSlotEmits,
  BlockSlotProps,
  BlockSwitchEmits,
  BlockSwitchProps,
  GroupBlockEmits,
  GroupBlockProps,
}

export type TxGroupBlockInstance = InstanceType<typeof TxGroupBlock>
export type TxBlockLineInstance = InstanceType<typeof TxBlockLine>
export type TxBlockSlotInstance = InstanceType<typeof TxBlockSlot>
export type TxBlockSwitchInstance = InstanceType<typeof TxBlockSwitch>

export default GroupBlock
