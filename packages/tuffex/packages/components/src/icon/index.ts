import type { App } from 'vue'
import { withInstall } from '../../../utils/withInstall'
import TuffIcon from './src/TxIcon.vue'
import TxStatusIconComponent from './src/TxStatusIcon.vue'
import { TX_ICON_CONFIG_KEY } from './src/types'

const TxStatusIcon = withInstall(TxStatusIconComponent)

TuffIcon.install = (app: App) => {
  app.component('TuffIcon', TuffIcon)
  app.component('TxIcon', TuffIcon)
  app.component('TxStatusIcon', TxStatusIcon)
}

const TxIcon = TuffIcon
export { TuffIcon, TX_ICON_CONFIG_KEY, TxIcon, TxStatusIcon }
export type { TxStatusIconProps, TxStatusIconTone } from './src/status-icon'
export type {
  TxIconConfig,
  TxIconSource,
  TxIconStatus,
  TxIconSvgFetcher,
  TxIconType,
  TxIconUrlResolver,
} from './src/types'
export default TuffIcon
