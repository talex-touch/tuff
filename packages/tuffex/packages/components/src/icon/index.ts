import type { App } from 'vue'
import { withInstall } from '../../../utils/withInstall'
import TuffIcon from './src/TxIcon.vue'
import TxOsIconComponent from './src/TxOsIcon.vue'
import TxStatusIconComponent from './src/TxStatusIcon.vue'
import { TX_ICON_CONFIG_KEY } from './src/types'

const TxStatusIcon = withInstall(TxStatusIconComponent)
const TxOsIcon = withInstall(TxOsIconComponent)

TuffIcon.install = (app: App) => {
  app.component('TuffIcon', TuffIcon)
  app.component('TxIcon', TuffIcon)
  app.component('TxStatusIcon', TxStatusIcon)
  app.component('TxOsIcon', TxOsIcon)
}

const TxIcon = TuffIcon
export { shouldRenderSvgAsMask } from './src/svg-color-mode'
export { TuffIcon, TX_ICON_CONFIG_KEY, TxIcon, TxOsIcon, TxStatusIcon }
export type { TxStatusIconProps, TxStatusIconTone } from './src/status-icon'
export type TxOsIconInstance = InstanceType<typeof TxOsIconComponent>
export type {
  TxIconConfig,
  TxIconSource,
  TxIconStatus,
  TxIconSvgFetcher,
  TxIconType,
  TxIconUrlResolver,
} from './src/types'
export default TuffIcon
