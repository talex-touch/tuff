import type { App } from 'vue'
import TuffIcon from './src/TxIcon.vue'
import { TX_ICON_CONFIG_KEY } from './src/types'

TuffIcon.install = (app: App) => {
  app.component('TuffIcon', TuffIcon)
  app.component('TxIcon', TuffIcon)
}

const TxIcon = TuffIcon
export { TuffIcon, TxIcon, TX_ICON_CONFIG_KEY }
export type {
  TxIconSource,
  TxIconType,
  TxIconStatus,
  TxIconConfig,
  TxIconUrlResolver,
  TxIconSvgFetcher,
} from './src/types'
export default TuffIcon
