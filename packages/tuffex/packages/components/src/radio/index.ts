import type { TxRadioGroupProps, TxRadioIndicatorVariant, TxRadioProps, TxRadioType, TxRadioValue } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxRadio from './src/TxRadio.vue'
import TxRadioGroup from './src/TxRadioGroup.vue'

const Radio = withInstall(TxRadio)
const RadioGroup = withInstall(TxRadioGroup)

export { Radio, RadioGroup, TxRadio, TxRadioGroup }
export type { TxRadioGroupProps, TxRadioIndicatorVariant, TxRadioProps, TxRadioType, TxRadioValue }
export type TxRadioInstance = InstanceType<typeof TxRadio>
export type TxRadioGroupInstance = InstanceType<typeof TxRadioGroup>

export default RadioGroup
