import type { GridProps } from './src/types'
import { withInstall } from '../utils/with-install'
import component from './src/TxGrid.vue'

const TxGrid = withInstall(component)

export { TxGrid }
export type { GridProps }
export type TxGridInstance = InstanceType<typeof component>

export default TxGrid
