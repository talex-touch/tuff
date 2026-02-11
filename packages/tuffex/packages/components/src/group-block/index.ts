import type {
  BlockInputEmits,
  BlockInputProps,
  BlockLineEmits,
  BlockLineProps,
  BlockSelectEmits,
  BlockSelectProps,
  BlockSlotEmits,
  BlockSlotProps,
  BlockSwitchEmits,
  BlockSwitchProps,
  GroupBlockEmits,
  GroupBlockProps,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxBlockInput from './src/TxBlockInput.vue'
import TxBlockLine from './src/TxBlockLine.vue'
import TxBlockSelect from './src/TxBlockSelect.vue'
import TxBlockSlot from './src/TxBlockSlot.vue'
import TxBlockSwitch from './src/TxBlockSwitch.vue'
import TxGroupBlock from './src/TxGroupBlock.vue'

/**
 * TxGroupBlock component with Vue plugin installation support.
 *
 * @example
 * ```ts
 * import { TxGroupBlock, TxBlockLine, TxBlockSlot, TxBlockSwitch, TxBlockInput, TxBlockSelect } from '@talex-touch/tuffex'
 * ```
 *
 * @public
 */
const GroupBlock = withInstall(TxGroupBlock)
const BlockLine = withInstall(TxBlockLine)
const BlockSlot = withInstall(TxBlockSlot)
const BlockSwitch = withInstall(TxBlockSwitch)
const BlockInput = withInstall(TxBlockInput)
const BlockSelect = withInstall(TxBlockSelect)

export {
  BlockInput,
  BlockLine,
  BlockSelect,
  BlockSlot,
  BlockSwitch,
  GroupBlock,
  TxBlockInput,
  TxBlockLine,
  TxBlockSelect,
  TxBlockSlot,
  TxBlockSwitch,
  TxGroupBlock,
}

export type {
  BlockInputEmits,
  BlockInputProps,
  BlockLineEmits,
  BlockLineProps,
  BlockSelectEmits,
  BlockSelectProps,
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
export type TxBlockInputInstance = InstanceType<typeof TxBlockInput>
export type TxBlockSelectInstance = InstanceType<typeof TxBlockSelect>

export default GroupBlock
