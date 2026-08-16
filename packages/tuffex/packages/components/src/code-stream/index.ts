import type { CodeStreamProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxCodeStream.vue'

const TxCodeStream = withInstall(component)

export { TxCodeStream }
export type { CodeStreamProps }
export type TxCodeStreamInstance = InstanceType<typeof component>

export default TxCodeStream
