import type { App } from 'vue'
import TuffInput from './src/TxInput.vue'

TuffInput.install = (app: App) => {
  app.component(TuffInput.name || 'TuffInput', TuffInput)
}

const TxInput = TuffInput

export { TuffInput, TxInput }
export default TuffInput
