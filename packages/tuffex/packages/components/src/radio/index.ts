import TxRadio from './src/TxRadio.vue'
import TxRadioGroup from './src/TxRadioGroup.vue'
import { withInstall } from '../../../utils/withInstall'
import type { TxRadioGroupProps, TxRadioProps, TxRadioValue } from './src/types'

const Radio = withInstall(TxRadio)
const RadioGroup = withInstall(TxRadioGroup)

export { Radio, RadioGroup, TxRadio, TxRadioGroup }
export type { TxRadioGroupProps, TxRadioProps, TxRadioValue }
export type TxRadioInstance = InstanceType<typeof TxRadio>
export type TxRadioGroupInstance = InstanceType<typeof TxRadioGroup>

export default RadioGroup
