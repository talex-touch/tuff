import type { App } from 'vue'
import TuffSwitch from './src/TxSwitch.vue'

TuffSwitch.install = (app: App) => {
  app.component(TuffSwitch.name || 'TuffSwitch', TuffSwitch)
}

export { TuffSwitch }
export default TuffSwitch
