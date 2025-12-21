import type { App } from 'vue'
import TuffIcon from './src/TxIcon.vue'

TuffIcon.install = (app: App) => {
  app.component('TuffIcon', TuffIcon)
  app.component('TxIcon', TuffIcon)
}

const TxIcon = TuffIcon
export { TuffIcon, TxIcon }
export type { TxIconSource, TxIconType, TxIconStatus } from './src/types'
export default TuffIcon
