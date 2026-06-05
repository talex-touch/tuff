import type { App } from 'vue'
import TuffSwitch from './src/TxSwitch.vue'
import './style/index.scss'

TuffSwitch.install = (app: App) => {
  app.component(TuffSwitch.name || 'TuffSwitch', TuffSwitch)
}

const TxSwitch = TuffSwitch

export { TuffSwitch, TxSwitch }
export default TuffSwitch
