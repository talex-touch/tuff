import type { App } from 'vue'
import TuffIcon from './src/TxIcon.vue'
import TxStatusIconComponent from './src/TxStatusIcon.vue'
import { TX_ICON_CONFIG_KEY } from './src/types'
import { withInstall } from '../../../utils/withInstall'

const TxStatusIcon = withInstall(TxStatusIconComponent)

TuffIcon.install = (app: App) => {
  app.component('TuffIcon', TuffIcon)
  app.component('TxIcon', TuffIcon)
  app.component('TxStatusIcon', TxStatusIcon)
}

const TxIcon = TuffIcon
export { TuffIcon, TxIcon, TxStatusIcon, TX_ICON_CONFIG_KEY }
export type {
  TxIconSource,
  TxIconType,
  TxIconStatus,
  TxIconConfig,
  TxIconUrlResolver,
  TxIconSvgFetcher,
} from './src/types'
export type { TxStatusIconTone, TxStatusIconProps } from './src/status-icon'
export default TuffIcon
