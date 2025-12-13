import type { App } from 'vue'
import TuffInput from './src/TxInput.vue'

TuffInput.install = (app: App) => {
  app.component(TuffInput.name || 'TuffInput', TuffInput)
}

export { TuffInput }
export default TuffInput
