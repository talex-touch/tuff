import type { App } from 'vue'
import TuffProgress from './src/TxProgress.vue'

TuffProgress.install = (app: App) => {
  app.component(TuffProgress.name || 'TuffProgress', TuffProgress)
}

export { TuffProgress }
export default TuffProgress
