import type { TxFlatRadioItemProps, TxFlatRadioProps, TxFlatRadioValue } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxFlatRadio from './src/TxFlatRadio.vue'
import TxFlatRadioItem from './src/TxFlatRadioItem.vue'

const FlatRadio = withInstall(TxFlatRadio)
const FlatRadioItem = withInstall(TxFlatRadioItem)

export { FlatRadio, FlatRadioItem, TxFlatRadio, TxFlatRadioItem }
export type { TxFlatRadioItemProps, TxFlatRadioProps, TxFlatRadioValue }
export { FLAT_RADIO_KEY } from './src/types'
export type TxFlatRadioInstance = InstanceType<typeof TxFlatRadio>
export type TxFlatRadioItemInstance = InstanceType<typeof TxFlatRadioItem>

export default FlatRadio
